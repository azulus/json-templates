import ASTBuilder from "./ast";
import { JsonTemplateError } from "./combinators/core";
import { interpolatedJson, jsonInterpolatedASTToValue } from "./combinators/json-interpolation";
import { Parseable, Token, Tokenizer } from "./tokens";

class TemplateError extends Error {
  constructor(message: string, public readonly context: { cause?: Error }) {
    super(message);
  }
}

function truncate(str: string, n: number) {
  return str.length > n ? str.slice(0, n - 1) + "..." : str;
}

export const evaluateTemplate = (obj: Parseable, params: Record<string, any>) => {
  let tokenizer = new Tokenizer();
  let tokens: Token[] = [],
    input: Parseable;
  try {
    [tokens, input] = tokenizer.toTokens(obj);

    let astBuilder = new ASTBuilder();
    let ast = astBuilder.generateAST(tokens, interpolatedJson);
    let response = jsonInterpolatedASTToValue(ast, params);
    return response;
  } catch (e: any) {
    if (e instanceof JsonTemplateError) {
      if (!e.jsonPath) {
        console.log("e.startToken", e.startToken, tokens[e.startToken]);
        e.setPath(tokens[e.startToken].jsonPath);
      }
      let [errorNode] = tokenizer.getValueForJsonPath(e.jsonPath!, input!);
      throw new TemplateError(`Error at ${e.jsonPath?.path.join(".")} (${truncate(JSON.stringify(errorNode), 60)}): ${e.message}`, { cause: e });
    }
    throw e;
  }
};
