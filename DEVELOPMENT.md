# Development

Instructions on how run this project yourself and a brief description of how it works.

_I am not accepting additional contributions at this time_. This project is licensed with the MIT license, you may use it however you wish, but if you're looking to add this to your own GitHub profile I would kindly appreciate some credit!

## Setup

Install [Node Version Manager](https://github.com/nvm-sh/nvm) if you haven't already.

```sh
$ nvm use
$ npm ci
$ npm start # Open http://localhost:5173

# To render & output gifs to Cloudflare R2,
# Follow the R2 auth token guide,
# https://developers.cloudflare.com/r2/data-access/s3-api/tokens/
$ cp .env.example .env

# NOTE: You can run this command without an `.env` file,
# it will just write the gifs to your local file system.
$ npm run render

# NOTE: By default, this will in fact try to render a lot of gifs. 
# You might want to adjust the 'TOTAL_SIMULATIONS' variable in 'render.ts' 
# to be a tad less crazy if you're just experimenting for fun.

# Also, this runs across all available cores on your machine, 
# you might hear some fan noises.
```

## How it works

The Game of Life simulation and rendering can be found under `src/simulation.ts`, which is compiled to isomorphic Javascript that only depends on the [canvas api](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API). During local development, this script runs directly in your browser. In NodeJS environments, the canvas api is polyfilled with [node-canvas](https://github.com/Automattic/node-canvas).

### Rendering a lot of gifs

The Node render process is written in Typescript (`src/render.ts`) and is compiled to Javascript (`dist/render.js`) using the `./tsconfig.node.json` compiler options.

The render process uses all available cores of the machine it is running on to maximize the amount of simulations and gif renders that can happen concurrently. Each worker is assigned a numeric range to process, and is able to somewhat self-correct and retry in the event of a failure.

For thread management, this project uses the [Node Cluster Module](https://nodejs.org/api/cluster.html) so the memory is isolated between multiple NodeJS processes. [Node Worker Threads](https://nodejs.org/api/worker_threads.html) share memory, and run into weird issues with the Node Canvas being a C++ addon that is not "context aware", see this [Github issue](https://github.com/Automattic/node-canvas/issues/1394#issuecomment-537734594) for more information.

To guarantee that each simulation is indeed unique, the initial seed of the simulation data is md5 hashed and written to a `/tmp` folder. The initial simulation data will be regenerated until a unique dataset is created.

The resulting gif data is piped to either the local filesystem or Cloudflare R2.
