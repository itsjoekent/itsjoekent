const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const express = require('express');
const { createCanvas } = require('canvas');
const GIFEncoder = require('gifencoder');
const parser = require('cellular-automata-rule-parser');

const PIXEL_WIDTH = 480;
const PIXEL_HEIGHT = 360;

const CELL_SIZE = 12;
const ITERATIONS = 45;
const MAX_INITIAL_SPAWNS = Math.floor(PIXEL_WIDTH * .15);
const MIN_INITIAL_SPAWNS = MAX_INITIAL_SPAWNS / 2;

const app = express();
const rule = parser('S23/B3');

function randomIntFromInterval(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min)
}

function createGameBoard() {
  const board = [];

  for (let y = 0; y < PIXEL_HEIGHT / CELL_SIZE; y++) {
    board[y] = [];
    for (let x = 0; x < PIXEL_WIDTH / CELL_SIZE; x++) {
      board[y][x] = 0;
    }
  }

  const spawnCount = randomIntFromInterval(MIN_INITIAL_SPAWNS, MAX_INITIAL_SPAWNS);
  for (let index = 0; index < spawnCount; index++) {
    const spawns = [];
    for (let cell = 0; cell < 9; cell++) {
      spawns[cell] = Math.round(Math.random());
    }

    const x = randomIntFromInterval(0, (PIXEL_WIDTH / CELL_SIZE) - 1);
    const y = randomIntFromInterval(0, (PIXEL_HEIGHT / CELL_SIZE) - 1);

    function set(localX, localY, value) {
      if (localX < 0) return;
      if (localX > (PIXEL_WIDTH / CELL_SIZE) - 1) return;
      if (localY < 0) return;
      if (localY > (PIXEL_HEIGHT / CELL_SIZE) - 1) return;

      board[localY][localX] = value;
    }

    set(x, y, spawns[0]);
    set(x, y + 1, spawns[1]);
    set(x, y - 1, spawns[2]);
    set(x + 1, y, spawns[3]);
    set(x - 1, y, spawns[4]);
    set(x + 1, y + 1, spawns[5]);
    set(x + 1, y - 1, spawns[6]);
    set(x - 1, y + 1, spawns[7]);
    set(x - 1, y - 1, spawns[8]);

    // board[randomIntFromInterval(0, (PIXEL_HEIGHT / CELL_SIZE) - 1)][randomIntFromInterval(0, (PIXEL_WIDTH / CELL_SIZE) - 1)] = Math.round(Math.random());
  }

  return board;
}

function simulateGameBoard(board) {
  const updatedBoard = [];

  function get(x, y) {
    return (board[y] || [])[x] || 0;
  }

  for (let y = 0; y < PIXEL_HEIGHT / CELL_SIZE; y++) {
    updatedBoard[y] = [];

    for (let x = 0; x < PIXEL_WIDTH / CELL_SIZE; x++) {
      const cell = board[y][x];

      const neighbors = [
        get(x, y + 1),
        get(x, y - 1),
        get(x + 1, y),
        get(x - 1, y),
        get(x + 1, y + 1),
        get(x + 1, y - 1),
        get(x - 1, y + 1),
        get(x - 1, y - 1),
      ];

      updatedBoard[y][x] = rule.process(cell, neighbors);
    }
  }

  return updatedBoard;
}

async function run(req, res) {
  const board = createGameBoard();
  const simulations = [board];
  for (let index = 0; index < ITERATIONS - 1; index++) {
    simulations.push(simulateGameBoard(simulations[index]));
  }

  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'max-age=0, no-cache, no-store, must-revalidate');

  const canvas = createCanvas(PIXEL_WIDTH, PIXEL_HEIGHT);
  const ctx = canvas.getContext('2d');

  const encoder = new GIFEncoder(PIXEL_WIDTH, PIXEL_HEIGHT);

  const stream = encoder.createReadStream();//.pipe(fs.createWriteStream(path.join(process.cwd(), '/tmp/animated.gif')));

  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(200);
  encoder.setQuality(10);

  for (const board of simulations) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, PIXEL_WIDTH, PIXEL_HEIGHT);

    ctx.fillStyle = '#0074D9';

    for (let y = 0; y < PIXEL_HEIGHT / CELL_SIZE; y++) {
      for (let x = 0; x < PIXEL_WIDTH / CELL_SIZE; x++) {
        const cell = board[y][x];

        if (!!cell) {
          ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        }
      }
    }

    encoder.addFrame(ctx);
  }
  
  encoder.finish();

  stream.on('end', () => res.end());
  stream.pipe(res);
}

app.get('/', run);
app.get('/game.gif', run);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
