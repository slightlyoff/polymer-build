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

/// <reference path="../../node_modules/@types/mocha/index.d.ts" />


import {assert} from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import * as vfs from 'vinyl-fs';
const temp = require('temp').track();
const mergeStream = require('merge-stream');

import {PolymerProject} from '../polymer-project';
import * as pushManifest from '../push-manifest';

suite('push-manifest', () => {

  let testBuildRoot: string;
  let defaultProject: PolymerProject;

  setup((done) => {

    defaultProject = new PolymerProject({
      root: path.resolve('test-fixtures/test-project'),
      entrypoint: 'index.html',
      shell: 'shell.html',
      sources: [
        'source-dir/**',
      ],
    });

    temp.mkdir('polymer-build-test', (err: Error, dir?: string) => {
      if (err) {
        return done(err);
      }
      testBuildRoot = dir;
      vfs.src(path.join('test-fixtures/test-project/**'))
          .pipe(vfs.dest(dir))
          .on('finish', () => {
            mergeStream(defaultProject.sources(), defaultProject.dependencies())
                .pipe(vfs.dest(testBuildRoot))
                .on('finish', () => done())
                .on('error', done);
          });

    });
  });

  teardown((done) => {
    temp.cleanup(done);
  });

  suite('generatePushManifest()', () => {

    test('should throw when options are not provided', () => {
      return (<any>pushManifest.generatePushManifest)().then(
          () => {
            assert.fail(
                'generatePushManifest() resolved, expected rejection!');
          },
          (error: Error) => {
            assert.equal(error.name, 'AssertionError');
            assert.equal(
                error.message, '`project` & `buildRoot` options are required');
          });
    });

    test('should throw when options.project is not provided', () => {
      return (<any>pushManifest.generatePushManifest)(
                 {buildRoot: testBuildRoot})
          .then(
              () => {
                assert.fail(
                    'generatePushManifest() resolved, expected rejection!');
              },
              (error: Error) => {
                assert.equal(error.name, 'AssertionError');
                assert.equal(error.message, '`project` option is required');
              });
    });

    test('should throw when options.buildRoot is not provided', () => {
      return (<any>pushManifest.generatePushManifest)(
                 {project: defaultProject})
          .then(
              () => {
                assert.fail(
                    'generatePushManifest() resolved, expected rejection!');
              },
              (error: Error) => {
                assert.equal(error.name, 'AssertionError');
                assert.equal(error.message, '`buildRoot` option is required');
              });
    });

    test(
        'should resolve with a Buffer representing the generated push manifest',
        () => {
          return pushManifest.generatePushManifest({
                project: defaultProject,
                buildRoot: testBuildRoot,
              })
              .then((pmCode: Buffer) => {
                assert.ok(pmCode instanceof Buffer);
              });
        });

    test(
        'should add unbundled assets when options.unbundled is not provided',
        () => {
          return pushManifest
              .generatePushManifest({
                project: defaultProject,
                buildRoot: testBuildRoot,
              })
              .then((pmFile: Buffer) => {
                const fileContents = pmFile.toString();
                assert.include(fileContents, path.join('"/shell.html"'));
                assert.include(
                    fileContents, path.join('"bower_components/dep.html"'));
                assert.notInclude(
                    fileContents, path.join('"/source-dir/my-app.html"'));
              });
        });

  });

  suite('addPushManifest()', () => {

    test('should write generated push manifest to file system', () => {
      return pushManifest
          .addPushManifest({
            project: defaultProject,
            buildRoot: testBuildRoot,
          })
          .then(() => {
            const content = fs.readFileSync(
                path.join(testBuildRoot, 'push_manifest.json'), 'utf-8');
            assert.include(
                content,
                '{\n  "/shell.html": {\n    "bower_components/dep.html":');
          });
    });

  });

});
