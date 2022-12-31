# Development

Instructions on how run this project yourself and a brief description of how it works.

_I am not accepting additional contributions at this time_. This project is licensed with the MIT license, you may use it however you wish, but if you're looking to add this to your own GitHub profile I would kindly appreciate some credit!

## Setup

Install [Node Version Manager](https://github.com/nvm-sh/nvm) if you haven't already.

```sh
$ nvm use
$ npm ci
$ npm start # Open http://localhost:5173
```

## How it works

The Game of Life simulation and rendering can be found under `src/simulation.ts`, which is compiled to isomorphic Javascript that only depends on the [canvas api](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API). During local development, this script runs directly in your browser. In NodeJS environments, the canvas api is polyfilled with [node-canvas](https://github.com/Automattic/node-canvas).

<!-- TODO, generating the gifs at scale -->
