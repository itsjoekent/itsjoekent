import cluster from 'cluster';
import fsClassic from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import aws from 'aws-sdk';
import { createCanvas } from 'canvas';
import { config } from 'dotenv';
import GifEncoder from 'gifencoder';
import md5 from 'md5';
import pino, { Logger } from 'pino';
import { getInitialSimulationState, runSimulation } from './simulation';

const startedAt = Date.now();

// Setup environment variables
config();

const globalLogger = pino({
  transport: {
    target: 'pino-pretty'
  },
});

const s3 = new aws.S3({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  accessKeyId: `${process.env.R2_ACCESS_KEY_ID}`,
  secretAccessKey: `${process.env.R2_SECRET_ACCESS_KEY}`,
  signatureVersion: 'v4',
});

const TOTAL_SIMULATIONS = 1000000;

// When testing low simulation amounts...
const totalCpus = Math.min(TOTAL_SIMULATIONS, os.cpus().length);

const SIMULATIONS_PER_CPU = Math.floor(TOTAL_SIMULATIONS / totalCpus);
const REMAINDER_SIMULATIONS = TOTAL_SIMULATIONS - (SIMULATIONS_PER_CPU * totalCpus);

const CANVAS_WIDTH = 846;
const CANVAS_HEIGHT = 420;

const simulationStatus = new Array(totalCpus).fill(false);

function exit(code: number): never {
  // allow time for the logger & logger prettification to catch up.
  return setTimeout(() => process.exit(code), 10) as never;
}

function checkCanSafelyExit() {
  if (simulationStatus.filter((status) => !status).length) return;

  const end = Date.now();
  const durationMinutes = ((end - startedAt) / 1000) / 60;

  globalLogger.info(`all simulations completed in ${durationMinutes} minutes, exiting!`);
  exit(0);
}

function forkWorkerThread(workerId: number, startIndex: number, endIndex: number, retries: number = 0) {
  let index = startIndex;

  const worker = cluster.fork({
    START_INDEX: startIndex,
    END_INDEX: endIndex,
    WORKER_ID: workerId,
  });
  
  const observerLogger = globalLogger.child({ process: 'worker observer', workerId });

  function restart() {
    if (retries < 3) {
      observerLogger.info(`Attempting restart from index ${index}, retry #${retries + 1}`);
      forkWorkerThread(workerId, index, endIndex, retries + 1);
    } else {
      observerLogger.error(`Range ${startIndex} -> ${endIndex}, current index ${index}, cannot be restarted safely, aborting...`);
      return exit(1);
    }
  }

  worker.on('message', (message) => {
    index = parseInt(message);
  });

  worker.on('exit', (code) => {
    if (code === 0) {
      observerLogger.info(`done!`);
      simulationStatus[workerId] = true;
      checkCanSafelyExit();
    } else {
      observerLogger.warn(`exited with code ${code}`);
      restart();
    }
  });  
}

async function makeGif(logger: Logger, index: number, retries: number = 0): Promise<void> {
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const initialState = getInitialSimulationState(canvas);

  const initialStateHash = md5(JSON.stringify(initialState));
  const hashFilePath = path.join(process.cwd(), 'tmp/hashes', initialStateHash);

  try {
    await fs.access(hashFilePath, fs.constants.R_OK);
    
    if (retries < 1000) {
      return makeGif(logger, index, retries + 1);
    }

    logger.error(`Ran out of simulation state seed attempts... This seems mathematically impossible but whatever here we are.`);
    return exit(1);
  } catch (error) {}

  await fs.writeFile(hashFilePath, '');
  
  const encoder = new GifEncoder(CANVAS_WIDTH, CANVAS_HEIGHT);
  const stream = encoder.createReadStream();
  let streamPromise = new Promise<any>((resolve) => resolve(null));

  if (process.env.R2_BUCKET) {
    streamPromise = s3.upload({
      Bucket: process.env.R2_BUCKET,
      Key: `${index}.gif`,
      Body: stream,
    }).promise();
  } else {
    stream.pipe(fsClassic.createWriteStream(path.join(process.cwd(), 'tmp/gifs', `${index}.gif`)));

    streamPromise = new Promise<void>((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });    
  }

  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(1000 / 30); // 1000 milliseconds (1s) / 30 frames
  encoder.setQuality(10);

  let state = { ...initialState };
  const totalSimulationsToRun = 30 * 3; // 30 frames * 3 seconds

  for (let frameIndex = 0; frameIndex < totalSimulationsToRun; frameIndex++) {
    state = runSimulation(state, canvas);
    
    // @ts-ignore
    encoder.addFrame(canvas.getContext('2d'));
    // There is a weird type compatability issue with the addFrame rendering context 
    // and the node-canvas rendering context. But this is copied from the gifencoder
    // example: https://www.npmjs.com/package/gifencoder#example-streaming-api---reads
  }

  encoder.finish();

  return streamPromise;
}

async function start(logger: Logger, startIndex: number, endIndex: number, retries: number = 0): Promise<void> {
  let index = 0;

  try {
    for (index = startIndex; index <= endIndex; index++) {
      await makeGif(logger, index);

      const percentDone = Math.round((index / endIndex) * 100);
      if (percentDone % 5 === 0) {
        logger.info(`${percentDone}% done, ${index} of ${endIndex}`);
      }

      if (!cluster.isPrimary) {
        process.send!(index);
      }
    }
  } catch (error) {
    logger.error(error);

    if (retries < 3) {
      logger.warn(`Attempting restart at index ${index}, retry #${retries + 1}`);
      return start(logger, index, endIndex, retries + 1);
    } else {
      logger.error(`Range ${startIndex} -> ${endIndex}, current index ${index}, cannot be restarted safely, aborting...`)
      return exit(1);
    }
  }
}

(async function () {
  if (cluster.isPrimary) {
    try {
      await fs.mkdir(path.join(process.cwd(), 'tmp/hashes'), { recursive: true });
      await fs.mkdir(path.join(process.cwd(), 'tmp/gifs'), { recursive: true });
    } catch (error: any) {
      globalLogger.error(error);
      return exit(1);
    }

    const mainLogger = globalLogger.child({ process: 'main' });
    const clusterWorkerSize = totalCpus - 1;
    mainLogger.info(`Forking ${clusterWorkerSize} threads...`);

    for (let index = 0; index < clusterWorkerSize; index++) {
      // offset by ${SIMULATIONS_PER_CPU * 1} to account for main thread
      const startIndex = SIMULATIONS_PER_CPU + (SIMULATIONS_PER_CPU * index);
      let endIndex = startIndex + (SIMULATIONS_PER_CPU - 1);

      // The SIMULATIONS / CPU's division leaves decimals that need to be rounded down. 
      // Append the remainder to the last worker.
      if (index === clusterWorkerSize - 1) {
        endIndex += REMAINDER_SIMULATIONS;
      }

      forkWorkerThread(index + 1, startIndex, endIndex);
    }

    const endIndex = SIMULATIONS_PER_CPU - 1;
    await start(mainLogger, 0, endIndex);

    mainLogger.info('main thread is done.')
    simulationStatus[0] = true;
    checkCanSafelyExit();
  } else {
    const { START_INDEX, END_INDEX, WORKER_ID } = process.env;

    const startIndex = parseInt(START_INDEX || '');
    const endIndex = parseInt(END_INDEX || '');
    const workerId = WORKER_ID;

    const workerLogger = globalLogger.child({ process: 'worker', workerId });

    await start(workerLogger, startIndex, endIndex);

    return exit(0);
  }
})();
