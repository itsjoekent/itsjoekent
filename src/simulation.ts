import type { Canvas as NodeCanvas, CanvasRenderingContext2D as NodeCanvasRenderingContext2D } from 'canvas';
import * as tween from './tween';

type HexColor = [number, number, number, number];

type SimulationCell = {
  x: number;
  y: number;
  life: 0 | 1;
  lastUpdated: number;
};

type SimulationState = {
  backgroundColor: HexColor;
  cells: SimulationCell[][];
  totalCellsWide: number;
  totalCellsTall: number;
};

type UniversalaCanvas = HTMLCanvasElement | NodeCanvas;
type UniversalCanvasContext = CanvasRenderingContext2D | NodeCanvasRenderingContext2D;

const CELL_PIXEL_SIZE = 2;
const CELL_SPACING = 0.5;
const TRUE_CELL_LENGTH = CELL_PIXEL_SIZE + (CELL_SPACING * 2);

const CELL_COLOR_ONE: HexColor = [131, 56, 236, 1];
const CELL_COLOR_TWO: HexColor = [58, 134, 255, 1];

export function getInitialSimulationState(canvas: UniversalaCanvas): SimulationState {
  const { width, height } = canvas;
  const [totalCellsWide, totalCellsTall] = [width / TRUE_CELL_LENGTH, height / TRUE_CELL_LENGTH];

  const cells: SimulationCell[][] = [];

  for (let x = 0; x < totalCellsWide; x++) {
    cells[x] = [];
    for (let y = 0; y < totalCellsTall; y++) {
      cells[x][y] = {
        x,
        y,
        life: Math.random() > 0.95 ? 1 : 0, 
        lastUpdated: Date.now(),
      };
    }
  }

  return { backgroundColor: [34, 39, 46, 1], cells, totalCellsWide, totalCellsTall };
}

function getCellCanvasPixel(cellCoordinate: number) {
  return (TRUE_CELL_LENGTH * cellCoordinate) + CELL_SPACING;
}

function getCell(x: number, y: number, cells: SimulationState['cells']): SimulationCell | null {
  if (x < 0 || x >= cells.length) return null;
  
  const yCells = cells[x];
  if (y < 0 || y >= yCells.length) return null;

  return yCells[y];
}

// From here: https://stackoverflow.com/a/30144587
function pickRgbColor(color1: HexColor, color2: HexColor, weight: number): HexColor {
  const weight2 = 1 - weight;
  return [
    Math.round(color1[0] * weight + color2[0] * weight2),
    Math.round(color1[1] * weight + color2[1] * weight2),
    Math.round(color1[2] * weight + color2[2] * weight2),
    Math.round(color1[3] * weight + color2[3] * weight2),
  ];
}

function getCellColor(cell: SimulationCell, state: SimulationState): HexColor {
  const cellColor = pickRgbColor(CELL_COLOR_ONE, CELL_COLOR_TWO, cell.x / state.totalCellsWide);

  if (!cell.life) {
    const endOfLife = cell.lastUpdated + 250;
    if (Date.now() > endOfLife) return state.backgroundColor;

    const range = endOfLife - cell.lastUpdated
    const progress = (range - (endOfLife - Math.min(endOfLife, Date.now()))) / range;

    return pickRgbColor(state.backgroundColor, cellColor, progress);
  }

  return cellColor;
}

function hexColorToString(hexColor: HexColor): string {
  return `rgba(${hexColor.join(', ')})`;
}

export function runSimulation(state: SimulationState, canvas: UniversalaCanvas): SimulationState {
  const updatedState = { ...state };
  const { width, height } = canvas;

  const context = canvas.getContext('2d') as UniversalCanvasContext;
  if (!context) throw new Error('Failed to get canvas context?');

  context.clearRect(0, 0, width, height);
  context.fillStyle = hexColorToString(state.backgroundColor);
  context.fillRect(0, 0, width, height);

  for (let x = 0; x < state.cells.length; x++) {
    for (let y = 0; y < state.cells[x].length; y++) {
      const cell = state.cells[x][y];

      const neighbors: ReturnType<typeof getCell>[] = [
        getCell(x, y + 1, state.cells),
        getCell(x, y - 1, state.cells),
        getCell(x + 1, y, state.cells),
        getCell(x - 1, y, state.cells),
        getCell(x + 1, y + 1, state.cells),
        getCell(x + 1, y - 1, state.cells),
        getCell(x - 1, y + 1, state.cells),
        getCell(x - 1, y - 1, state.cells),
      ];

      const liveNeighborValues = neighbors.reduce((total, neighbor) => (
        !neighbor || !neighbor.life ? total : total + 1
      ), 0);

      const { life: currentCellLife } = cell;
      let updatedCellLife: SimulationCell['life'] = 0;

      // Game of life rules:
      // Any live cell with two or three live neighbours survives.
      // Any dead cell with three live neighbours becomes a live cell.
      // All other live cells die in the next generation.Similarly, all other dead cells stay dead.

      if (!!currentCellLife && liveNeighborValues >= 2 && liveNeighborValues <= 3) {
        updatedCellLife = 1;
      }

      if (!currentCellLife && liveNeighborValues === 3) {
        updatedCellLife = 1;
      }

      if (currentCellLife !== updatedCellLife) {
        updatedState.cells[x][y].life = updatedCellLife;
        updatedState.cells[x][y].lastUpdated = Date.now();
      }

      const updatedCell = updatedState.cells[x][y];

      const [canvasX, canvasY] = [
        getCellCanvasPixel(x),
        getCellCanvasPixel(y),
      ];

      context.fillStyle = hexColorToString(getCellColor(updatedCell, state));
      context.fillRect(canvasX, canvasY, CELL_PIXEL_SIZE, CELL_PIXEL_SIZE);
    }
  }

  return updatedState;
}
