import { Combinator, JsonTemplateError } from "./combinators/core";
import { Token } from "./tokens";

export default class ASTBuilder<T> {
  generateAST(tokens: Token[], rootCombinator: Combinator<T>) {
    console.log("\n\n");
    try {
      let results = rootCombinator(tokens, 0);
      if (!results.success) {
        throw new Error("Failed to parse");
      }
      if (results.startToken != 0 || results.endToken != tokens.length - 1) {
        throw new Error(
          `Full token range not consumed: ${results.startToken} - ${results.endToken} of ${tokens.length}`
        );
      }
      return results;
    } catch (e) {
      if (e instanceof JsonTemplateError) {
        e.setPath(tokens[e.startToken].jsonPath);
      }
      throw e;
    }
  }
}
