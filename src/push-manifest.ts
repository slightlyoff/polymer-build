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
// let log = logger.debug;

export interface AddPushManifestOptions {
  project: PolymerProject;
  buildRoot: string;
  bundled?: boolean;
  path?: string;
}

/**
 * Returns an object populated with mappings of entry-point files to resources
 * using information provided in the DepsIndex object.
 */
function getDepsObject(
    depsIndex: DepsIndex, root: string): Object {
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

  let output:any = Object.create(null);
  // log(<any>depsIndex);

  depsIndex.fragmentToFullDeps.forEach(
      (assets: DocumentDeps, file: string) => {
    // Workaround for TS brokenness on String::split
    // let localFile = file.substr(root.length);
    let localFile = file.split(root)[1];
    let item:any = output[localFile] = {};
    types.forEach(({name, defaults}) => {
      assets[name].forEach((f) => {
        // TODO(slightlyoff): support custom config
        item[f] = defaults;
      })
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
  // logger.debug(<any>project);
  const root = project.config.root;
  const depsIndex = await project.analyzer.analyzeDependencies;
  // let staticFileGlobs = Array.from(swPrecacheConfig.staticFileGlobs || []);
  const depsObject = (options.bundled) ?
      Object.create(null) :
      getDepsObject(depsIndex, root);

  // logger.debug(JSON.stringify(depsObject, null, "  "));

  // TODO(slightlyoff): what about static file dependencies?

  return await<Promise<Buffer>>(new Promise((resolve) => {
    logger.debug(`writing push manifest...`);
    resolve(new Buffer(JSON.stringify(depsObject, null, "  ")));
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
