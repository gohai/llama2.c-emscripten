const { resolve } = require("path");

module.exports = function (env, argv) {
  return {
    context: __dirname,
    entry: "./src/interface.js",

    mode: env.production ? "production" : "development",
    devtool: env.production ? "source-map" : "inline-source-map",
    output: {
      filename: "llama2.js",
      path: resolve(__dirname, "dist"),
      publicPath: "",
      library: {
        name: "LLAMA2",
        type: "umd",
        export: "default",
      },
    },
    resolve: {
        fallback: {
            crypto: false,
            fs: false,
            path: false
        },
    },
    module: {
      rules: [
        {
          test: /llama2\.wasm$/,
          type: "asset/resource",
          generator: {
            filename: "[name].wasm"
          }
        },
        {
          test: /llama2\.data$/,
          type: "asset/resource",
          generator: {
            filename: "[name].data"
          }
        }
      ]
    }
  };
};
