import { getInitialSimulationState, runSimulation } from './simulation';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;

let state = getInitialSimulationState(canvas);

function step() {
  state = runSimulation(state, canvas);
  requestAnimationFrame(step);
}

requestAnimationFrame(step);
