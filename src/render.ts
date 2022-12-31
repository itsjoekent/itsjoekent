import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createCanvas } from 'canvas';
import GifEncoder from 'gifencoder';
import pino, { Logger } from 'pino';
import WorkerThreads from 'worker_threads';
import { getInitialSimulationState, runSimulation } from './simulation';

const globalLogger = pino({
  transport: {
    target: 'pino-pretty'
  }, 
});

const totalCpus = os.cpus().length;

const TOTAL_SIMULATIONS = 1000000;
const SIMULATIONS_PER_CPU = Math.floor(TOTAL_SIMULATIONS / totalCpus);
const REMAINDER_SIMULATIONS = TOTAL_SIMULATIONS - (SIMULATIONS_PER_CPU * totalCpus);
const LOG_UPDATE_THRESHHOLD = Math.floor(SIMULATIONS_PER_CPU * 0.1);

const CANVAS_WIDTH = 846;
const CANVAS_HEIGHT = 420;

function badExit(): never {
  // allow time for the logger & logger prettification to catch up.
  return setTimeout(() => process.exit(1), 10) as never;
}

function roundTwoDecimals(input: number) {
  return Math.round((input + Number.EPSILON) * 100) / 100;
}

function forkWorkerThread(startIndex: number, endIndex: number, retries: number = 0) {
  let index = startIndex;
  const workerId = Date.now();
  const worker = new WorkerThreads.Worker(__filename, { workerData: { startIndex, endIndex, workerId } });
  const workerLogger = globalLogger.child({ process: 'worker observer', workerId });

  function restart() {
    if (retries < 3) {
      workerLogger.info(`Attempting restart from index ${index}, retry #${retries + 1}`);
      forkWorkerThread(index, endIndex, retries + 1);
    } else {
      workerLogger.error(`Range ${startIndex} -> ${endIndex}, current index ${index}, cannot be restarted safely, aborting...`);
      return badExit();
    }
  }

  worker.on('message', (message) => {
    index = parseInt(message);
  });

  worker.on('error', (error) => {
    workerLogger.error(error);
    restart();
  });

  worker.on('exit', (code) => {
    if (code === 0) {
      workerLogger.info(`done!`);
    } else {
      workerLogger.warn(`exited with code ${code}`);
      restart();
    }
  });  
}

// TODO: hash the initial simulation state, write to tmp file
// check if file exists before proceeding. ensure every simulation is unique.
// recursively do this up to like 100 times before bailing.

async function makeGif(index: number) {
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const encoder = new GifEncoder(CANVAS_WIDTH, CANVAS_HEIGHT);

  // TODO: This function breaks on the worker threads.
  // https://github.com/Automattic/node-canvas/issues/1394

  // I think we need to refactor to spawn processes instead,
  // https://github.com/Automattic/node-canvas/issues/1394#issuecomment-537734594
}

async function start(startIndex: number, endIndex: number, retries: number, logger: Logger): Promise<void> {
  let index = 0;

  try {
    for (index = startIndex; index < endIndex; index++) {
      await makeGif(index);

      if (index % LOG_UPDATE_THRESHHOLD === 0) {
        logger.info(`${roundTwoDecimals((index / endIndex) * 100)}% done`);
      }
      
      if (!WorkerThreads.isMainThread) {
        WorkerThreads.parentPort!.postMessage(index);
      }
    }
  } catch (error) {
    logger.error(error);

    if (retries < 3) {
      logger.warn(`Attempting restart at index ${index}, retry #${retries + 1}`);
      return start(index, endIndex, retries + 1, logger);
    } else {
      logger.error(`Range ${startIndex} -> ${endIndex}, current index ${index}, cannot be restarted safely, aborting...`)
      return badExit();
    }
  }
}

(async function () {
  if (WorkerThreads.isMainThread) {
    try {
      await fs.mkdir(path.join(process.cwd(), 'tmp'));
    } catch (error: any) {
      if (error?.code !== 'EEXIST') {
        globalLogger.error(error);
        return badExit();
      }
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

      forkWorkerThread(startIndex, endIndex);
    }

    const endIndex = SIMULATIONS_PER_CPU - 1;
    await start(0, endIndex, 0, mainLogger);

    mainLogger.info('main thread is done.')
  } else {
    const { startIndex, endIndex, workerId } = WorkerThreads.workerData;
    const workerLogger = globalLogger.child({ process: 'worker', workerId });

    await start(startIndex, endIndex, 0, workerLogger);
  }
})();
