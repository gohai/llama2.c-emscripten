// Copyright (c) 2023 ml5
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { EventEmitter } from "events";
import callCallback from "../utils/callcallback";
import handleArguments from "../utils/handleArguments";

import Llama2 from './llama2.js';
import Llama2Wasm from './llama2.wasm';
import Llama2Data from './llama2.data';


class LLAMA2 extends EventEmitter {
  constructor(optionsOrCb, cb) {
    super();

    this.options = {
      modelUrl: '',          // if set, model.bin will be preloaded from provided URL (assumed to be embedded in llama2.data if not)
      tokenizerUrl: '',      // if set, tokenizer.bin will be preloaded from provided URL (assumed to be embedded in llama2.data if not)
      steps: 0,              // how many tokens to generate (defaults to model's maximum)
      temperature: 0.9,      // 0.0 = (deterministic) argmax sampling, 1.0 = baseline
      stopOnBosOrEos: true,  // stop when encountering beginning-of-sequence or end-of-sequence token
    };

    // handle arguments
    let callback;
    if (typeof optionsOrCb === 'function') {
      callback = optionsOrCb;
    } else {
      if (typeof optionsOrCb === 'object') {
        this.options.modelUrl = (typeof optionsOrCb.modelUrl === 'string') ? optionsOrCb.modelUrl : this.options.modelUrl;
        this.options.tokenizerUrl = (typeof optionsOrCb.tokenizerUrl === 'string') ? optionsOrCb.tokenizerUrl : this.options.tokenizerUrl;
      }
      if (typeof cb === 'function') {
        callback = cb;
      }
    }

    this.out = '';
    this.tokens = [];
    this.words = [];
    this.finished = true;

    this.ready = callCallback(this.loadModel(), callback);
  }

  async loadModel() {
    const onStdout = (str) => {
      //console.log('onStdout', str);
    };

    this.llama2 = await Llama2({
      locateFile(path) {
        if (path.endsWith('.wasm')) {
          return Llama2Wasm;
        }
        if (path.endsWith('.data')) {
          return Llama2Data;
        }
        return path;
      },
      arguments: ['model.bin'],
      print: onStdout,
      preRun: [
        (inst) => {
          // model.bin and tokenizer.bin can either be baked into the llama2.data file
          // (leading to a large library size), or dynamically from an URL provided as
          // an option
          if (this.options.modelUrl) {
            inst.FS_createPreloadedFile('', 'model.bin', this.options.modelUrl, true, false);
          }
          if (this.options.tokenizerUrl) {
            inst.FS_createPreloadedFile('', 'tokenizer.bin', this.options.tokenizerUrl, true, false);
          }
        }
      ]
    });

    const onTokenCallback = await this.llama2.addFunction((tokenStr, token, probability, finished) => {
      // ignore tokens after BOS or EOS (with stopOnBosOrEn on)
      if (this.finished) {
        return;
      }

      tokenStr = this.llama2.UTF8ToString(tokenStr);
      this.tokens.push({ index: token, str: tokenStr, probability: probability });
      // llama2.c signals finished after completing all steps
      if (finished) {
        this.finished = true;
      }

      // optionally stop after encountering BOS (1) or EOS (2)
      if (this.options.stopOnBosOrEos && (token == 1 || token == 2)) {
        this.finished = true;
      } else {
        this.out += tokenStr;
      }

      // on-token callback/event
      if (this.callback) {
        this.callback(this);
      }
      this.emit('token', this);

      // redo word tokenization
      const wordDelimiters = ' .,:;"“?!\n';
      const re = new RegExp('(?=[' + wordDelimiters + '])|(?<=[' + wordDelimiters + '])', 'g');
      const prevNumWords = this.words.length;
      this.words = this.out.split(re);
      // ignore the last word if we can't be certain it's complete
      if (!wordDelimiters.includes(this.out.slice(-1)) && !this.finished) {
        this.words.pop();
      }
      // on-word event
      for (let i=prevNumWords; i < this.words.length; i++) {
        this.emit('word', this.words[i], this);
      }

      // on-finish promise/event
      if (this.finished) {
        // fulfill the promise returned by generate()
        if (this.promiseResolve) {
          this.promiseResolve(this.out);
        }
        this.emit('finsh', this);
      }
    }, 'viifi');

    await this.llama2.ccall('register_callback', null, [ 'number' ], [ onTokenCallback ]);

    //console.log('loadModel done');
  }

  async generate(prompt, optionsOrCb, cb) {
    await this.ready;

    // handle arguments
    if (typeof optionsOrCb === 'function') {
      this.callback = optionsOrCb;
    } else {
      if (typeof optionsOrCb === 'object') {
        this.options.steps = (typeof optionsOrCb.steps === 'number') ? optionsOrCb.steps : this.options.steps;
        this.options.temperature = (typeof optionsOrCb.temperature === 'number') ? optionsOrCb.temperature : this.options.temperature;
        this.options.stopOnBosOrEos = (typeof optionsOrCb.stopOnBosOrEos == 'boolean') ? optionsOrCb.stopPropagation : this.options.stopOnBosOrEos;
      }
      if (typeof cb === 'function') {
        this.callback = cb;
      } else {
        this.callback = null;
      }
    }

    // if there are any outstanding requests, resolve them
    // with the output received so far
    if (this.promiseResolve) {
      this.promiseResolve(this.out);
    }

    await this.llama2.ccall('set_parameters', null, [ 'number', 'number' ], [ this.options.temperature, this.options.steps ]);

    this.out = '';
    this.tokens = [{ index: 1, str: '<s>', probability: 1 }];
    this.words = [];
    this.finished = false;

    await this.llama2.ccall('generate', null, [ 'string' ], [ prompt ]);

    return new Promise((resolve, reject) => {
      this.promiseResolve = resolve;
    });
  }

  async vocab() {
    if (this._vocab) {
      return this._vocab;
    }

    await this.ready;
    const vocabSize = await this.llama2.ccall('get_vocab_size', 'number', [], []);
    const vocabPtr = await this.llama2.ccall('get_vocab', 'number', [], []);
    this._vocab = new Array(vocabSize);
    for (let i=0; i < vocabSize; i++) {
      const strPtr = this.llama2.HEAPU32[(vocabPtr+4*i)/4];
      this._vocab[i] = this.llama2.UTF8ToString(strPtr);
    }
    return this._vocab;
  }

  async manualStart(prompt, optionsOrCb, cb) {
    await this.ready;

    // handle arguments
    if (typeof optionsOrCb === 'function') {
      this.callback = optionsOrCb;
    } else {
      if (typeof optionsOrCb === 'object') {
        this.options.steps = (typeof optionsOrCb.steps === 'number') ? optionsOrCb.steps : this.options.steps;
        this.options.temperature = (typeof optionsOrCb.temperature === 'number') ? optionsOrCb.temperature : this.options.temperature;
        this.options.stopOnBosOrEos = (typeof optionsOrCb.stopOnBosOrEos == 'boolean') ? optionsOrCb.stopPropagation : this.options.stopOnBosOrEos;
      }
      if (typeof cb === 'function') {
        this.callback = cb;
      } else {
        this.callback = null;
      }
    }

    // if there are any outstanding requests, resolve them
    // with the output received so far
    if (this.promiseResolve) {
      this.promiseResolve(this.out);
    }

    await this.llama2.ccall('set_parameters', null, [ 'number', 'number' ], [ this.options.temperature, this.options.steps ]);

    this.out = '';
    this.tokens = [];
    this.words = [];
    this.finished = true;

    let token = await this.llama2.ccall('manual_start', 'number', [ 'string' ], [ prompt ]);
    return this.manualNext(token);
  }

  async manualNext(token) {
    await this.ready;

    if (typeof token === 'number') {
      // nothing to do
    } else if (typeof token === 'object' && typeof token.index === 'number') {
      token = token.index;
    } else if (typeof token === 'string') {
      // check if numeric
      if (token.match(/^\d+$/)) {
        token = parseInt(token);
      } else {
        // look up in vocabulary
        const vocab = await this.vocab();
        let found = false;
        for (let i=0; i < vocab.length; i++) {
          if (token === vocab[i]) {
            token = i;
            found = true;
            break;
          }
        }
        if (!found) {
          throw 'Not in vocabulary: ' + token;
        }
      }
    } else {
      throw 'Unrecognized next token: ' + token;
    }

    const vocab = await this.vocab();
    const logitsPtr = await this.llama2.ccall('manual_next', 'number', [ 'number' ], [ token ]);

    const tokens = new Array(vocab.length-1);
    for (let i=1; i < vocab.length; i++) {
      tokens[i] = { index: i, str: vocab[i], probability: this.llama2.HEAPF32[(logitsPtr+i*4)/4] };
    }
    tokens.sort((a, b) => (a.probability > b.probability) ? -1 : 1);

    // on-tokens callback/event
    if (this.callback) {
      this.callback(tokens, this);
    }
    this.emit('tokens', tokens, this);

    return tokens;
  }

}


export default LLAMA2;
