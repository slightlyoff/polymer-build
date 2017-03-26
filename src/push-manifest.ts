/**
 * @license
 * Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */

import {writeFile} from 'fs';
import * as path from 'path';
import * as logging from 'plylog';

import {DocumentDeps, DepsIndex} from './analyzer';
import {PolymerProject} from './polymer-project';

const logger = logging.getLogger('polymer-build.push-manifest');
// logger.debug = console.log.bind(console);
let log = logger.debug;

export interface AddPushManifestOptions {
  project: PolymerProject;
  buildRoot: string;
  bundled?: boolean;
  path?: string;
}

function getStripRootFunction(root: string): Function {
  return function(file: string) {
    if (file.indexOf(root) !== 0) { return file; }
    return file.split(root)[1];
  };
};

/**
 * Returns an object populated with mappings of entry-point files to resources
 * using information provided in the DepsIndex object.
 */
function getDepsObject(
    depsIndex: DepsIndex, root: string): Object {

  let stripRoot = getStripRootFunction(root);
  let types = [
    { name: 'scripts',
      defaults: { type: 'script', 'weight': 1 },
    },
    { name: 'styles',
      defaults: { type: 'style', 'weight': 1 },
    },
    { name: 'imports',
      defaults: { type: 'document', 'weight': 1 },
    }
  ];
  // TODO(slightlyoff): what about other dependent resource types? Fonts?
  // log(<any>depsIndex);

  let output: any = Object.create(null);

  depsIndex.fragmentToFullDeps.forEach(
      (assets: DocumentDeps, file: string) => {
    let localFile = stripRoot(file);
    let item: any = output[localFile] = {};
    types.forEach(({name, defaults}) => {
      assets[name].forEach((f) => {
        f = stripRoot(f);
        // Don't emit push for circular dep.
        if (localFile === f) { return; }
        // TODO(slightlyoff): support custom config
        item[f] = defaults;
      });
    });
  });

  return output;
}

/**
 * Returns a promise that resolves with a generated service worker (the file
 * contents), based off of the options provided.
 */
export async function generatePushManifest(options: AddPushManifestOptions):
    Promise<Buffer> {
  console.assert(!!options, '`project` & `buildRoot` options are required');
  console.assert(!!options.project, '`project` option is required');
  console.assert(!!options.buildRoot, '`buildRoot` option is required');

  options = Object.assign({}, options);
  const project = options.project;
  let root = project.config.root;
  // Root is always a directory; ensure we strip '/' later
  if (root.lastIndexOf('/') != (root.length-1)) { root += '/'; }
  const stripRoot = getStripRootFunction(root);
  const depsIndex = await project.analyzer.analyzeDependencies;

  // If we've been handed both an entrypoint and a shell in the project, ensure
  // that we output the shell's deps for the entrypoint (plus the shell
  // location); avoid adding the shell to the output to ensure we don't over-
  // push. See the docs for details:
  //    https://www.polymer-project.org/1.0/toolbox/server#app-entrypoint
  let entrypoint = project.config.entrypoint;
  let shell = project.config.shell;
  let fullDepsMap = depsIndex.fragmentToFullDeps;

  if ( ((entrypoint !== undefined) && (shell !== undefined)) &&
       (fullDepsMap.has(shell) && !fullDepsMap.has(entrypoint)) ) {
      let shellDeps = fullDepsMap.get(shell);
      let entrypointDeps = Object.assign({}, shellDeps);
      entrypointDeps.imports.unshift(stripRoot(shell));
      fullDepsMap.set(entrypoint, entrypointDeps);
      // TODO: should we remove the shell from the deps list? Do we risk over-
      // push if we don't?
  }

  const depsObject = (options.bundled) ?
      Object.create(null) :
      getDepsObject(depsIndex, root);

  // TODO(slightlyoff): what about static file dependencies?

  return await<Promise<Buffer>>(new Promise((resolve) => {
    log(`writing push manifest...`);
    // log(JSON.stringify(depsObject, null, '  '));
    resolve(new Buffer(JSON.stringify(depsObject, null, '  ')));
  }));
}


/**
 * Returns a promise that resolves when a service worker has been generated
 * and written to the build directory. This uses generateServiceWorker() to
 * generate a service worker, which it then writes to the file system based on
 * the buildRoot & path (if provided) options.
 */
export function addPushManifest(options: AddPushManifestOptions):
    Promise<{}> {
  return generatePushManifest(options).then((fileContents: Buffer) => {
    return new Promise((resolve, reject) => {
      const pushManifestPath =
          path.join(options.buildRoot, options.path || 'push_manifest.json');
      writeFile(pushManifestPath, fileContents, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
}
