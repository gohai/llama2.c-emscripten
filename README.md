## llama2.c Emscripten

This is an Emscripten (JavaScript) port of [@karpathy](https://github.com/karpathy)'s [llama2.c](https://github.com/karpathy/llama2.c). This was initially accomplished by [@ggerganov](https://github.com/ggerganov) (see PR [#12](https://github.com/karpathy/llama2.c/pull/12)). This repository attempts to build this out some more and stay current with upstream llama2.c.

See the [llama2.c README](https://github.com/karpathy/llama2.c/blob/master/README.md) for more information.


### Features

* Model and tokenizer can be optionally loaded from a URL
* Works via Promise (async/await), or event, or callback
* Probabilities are exposed to JavaScript
* Ability to manually pick next token
* Optionally stop on BOS or EOS token
* Simple output word tokenization

### Building

One of:

```
make emscripten [requires a model.bin, model+tokenizer included in build artifact]
make emscripten-small [model to be loaded from URL, tokenizer included in build artifact]
make emscripten-min [model+tokenizer to be loaded from URL]
```

Followed by:

```
cd web
npm install
npm run build
```

### API

#### Initialization

```
const llama2 = await new LLAMA();
```

You can optionally provide the some of the following options:

```
const options = {
	modelUrl: '',         // use a custom model from the provided URL instead
	tokenizerUrl: '',     // use the tokenizer.bin from the provided URL instead
	steps: 0,             // how many tokens to generate (default: model's maximum)
	temperature: 0.9,     // 0.0 = (deterministic) argmax sampling, 1.0 = baseline
	stopOnBosOrEos: true  // stop when encountering beginning-of-sequence or end-of-sequence token
}

const llama2 = await new LLAMA(options);
```

If you are in a context where you can't use `await`, you can instead also provide a callback function that will be invoked when the model is ready:

```
function modelReady() {
	console.log('LLAMA2 is ready');
}

let llama2 = new LLAMA(modelReady);

// or: let llama2 = new LLAMA(options, modelReady);
```

#### Generate output

Use the `generate` method to generate output starting with a given prompt string:

```
const out = await llama2.generate('Today was a great day in');
console.log(out);
```

You can also pass a callback function to be executed when the generation has finished:

```
function finishedGenerating(llama2) {
	console.log(llama2.out);
}

llama2.generate('Today was a great day in', finishedGenerating);
```

As the second argument, an object with the following option can optionally be passed: `temperature`, `steps`, `stopOnBosOrEos`. Those will overwrite previous options:

```
const out = await llama2.generate('Today was a great day in', { temperature: 0.8 });

// or: llama2.generate('Today was a great day in', { temperature: 0.8 }, finishedGenerating);
```

#### Events

The `generate` method will emit the following events:

##### token Event

Emitted at every token generated:

```
llama2.on('token', function(llama2) {
	console.log('token', llama2.tokens[llama2.tokens.length-1]);
	// will print e.g.:
	// {index: 3057, str: 'Test', probability: -4.414192199707031}
});
```

##### word Event

Emitted at every detected word added to the output:

```
llama2.on('word', function(word, llama2) {
	console.log('word', word);
});
```

##### finish Event

Emitted at the end of the generation:

```
llama2.on('finish', function(llama2) {
	console.log('finish', llama2.out);
});
```

#### Manual generation

Rather than receiving the finished output as-is, it's also possible to receive an array with possible continuations at each token, and manually - or programatically - select. The methods to do so are: `manualStart` and `manualNext`. The array of continuations are sorted by probability descending.

```
let continuations = await llama2.manualStart('Today was a great day in');

// this will return e.g.:
// [{ index: 278, str: ' the', probability: 0.9308871626853943 },
    { index: 3762, str: ' school', probability: 0.014727797359228134 },
    { index: 6709, str: ' spring', probability: 0.013729158788919449 }, ...]

continuations = await llama2.manualNext(continuations[0]);

// ...
```

`manualNext` also accepts the number of the index instead of the full object. Instead of `await`, a callback function can be used as well:

```
function onTokens(tokens, llama2) {
	console.log('tokens', tokens[0]);
	llama2.manualNext(tokens[0]);
}

llama2.manualStart('Today was a great day in', onTokens);
```

Note that this API does not keep track of whether the number of tokens generated stays within the reasonable limits set by the model.

Alternatively, it's also possible to use an event instead, as shown below.

##### onTokens event

```
llama2.on('tokens', function(tokens, llama2) {
	console.log('tokens', tokens[0]);
	llama2.manualNext(tokens[0]);
});
```

### Examples

See [basic.html](web/dist/basic.html) and [manual.html](web/dist/manual.html).
