import { JsonPath, Token, TokenType } from "../tokens";

export class JsonTemplateError extends Error {
  jsonPath: JsonPath | undefined;

  constructor(message: string, public startToken: number, public endToken: number, options?: ErrorOptions) {
    super(message, options);
    Object.setPrototypeOf(this, new.target.prototype);
  }

  setPath(jsonPath: JsonPath) {
    this.jsonPath = jsonPath;
  }
}

export enum CoreType {
  MatchType = "MatchType",
  ManyType = "ManyType",
  MaybeType = "MaybeType",
}

export type CombinatorSuccessStatus<T> = {
  success: true;
  type: T | CoreType;
  startToken: number;
  endToken: number;
};
export type CombinatorFailureStatus = { success: false };
export type CombinatorStatus<T> = CombinatorSuccessStatus<T> | CombinatorFailureStatus;
export type Combinator<T> = (tokens: Token[], startIdx: number) => CombinatorStatus<T>;

export const simpleFailure = (): CombinatorFailureStatus => ({ success: false });

export enum DebugLevel {
  Trace,
  Debug,
  Info,
  Warn,
  Error,
}

const debugStack: string[] = [];
let globalDebugLevel = DebugLevel.Warn;

const debugStackToString = () => {
  // render all
  // return debugStack.map((v, i) => (i == debugStack.length - 1 ? v : "  ")).join("");
  return debugStack.join(".");
};

export const debug = <T>(combinatorName: string, debugLevel: DebugLevel, combinator: Combinator<T>): Combinator<T> => {
  return (tokens, startToken) => {
    const doLog = (...any: any[]) => {
      if (debugLevel >= globalDebugLevel) {
        console.log(...any);
      }
    };
    if (debugLevel >= globalDebugLevel) {
      debugStack.push(combinatorName);
    }
    // doLog(`ENTER(${startToken}): ${debugStackToString()}`);
    try {
      let val = combinator(tokens, startToken);
      if (val && val.success) {
        doLog(`EXIT(${startToken}-${val.endToken ?? val.startToken}): ${debugStackToString()} -> SUCCESS`);
      } else {
        // doLog(`EXIT(${startToken}): ${debugStackToString()} -> FAILURE`);
      }
      return val;
    } catch (e) {
      doLog(`EXIT(${startToken}): ${debugStackToString()} -> ERROR`);
      throw e;
    } finally {
      if (debugLevel >= globalDebugLevel) {
        debugStack.pop();
      }
    }
  };
};

export const map = <T>(combinator: Combinator<T>, fn: (args: CombinatorStatus<T>) => CombinatorStatus<T>): Combinator<T> => {
  return debug("map", DebugLevel.Trace, (tokens, startToken): CombinatorStatus<T> => {
    const response = combinator(tokens, startToken);
    if (!response.success) return response;
    return fn(response);
  });
};

export const sequence = <T>(
  combinators: Combinator<T>[],
  fn: undefined | ((args: CombinatorSuccessStatus<T>[]) => Partial<CombinatorStatus<T>>) = undefined
): Combinator<T> => {
  return debug("sequence", DebugLevel.Trace, (tokens, startToken): CombinatorStatus<T> => {
    let startIdx = startToken;
    let results: CombinatorSuccessStatus<T>[] = [];
    for (let i = 0; i < combinators.length; i++) {
      const combinator = combinators[i];
      let result = combinator(tokens, startIdx);
      if (!result.success) {
        return simpleFailure();
      }

      results.push(result);
      startIdx = result.endToken + 1;
    }

    let response = fn !== undefined ? fn(results) : { success: true };
    // console.log(
    //   response.success,
    //   response,
    //   results.map((v) => [v.startToken, v.endToken])
    // );
    return response.success === false
      ? (response as CombinatorStatus<T>)
      : ({
          startToken,
          endToken: results.length > 0 ? results[results.length - 1].endToken : startToken - 1,
          ...response,
        } as CombinatorStatus<T>);
  });
};

export type OneOf<T> = Combinator<T> & { except?: (...exceptCombinators: Combinator<T>[]) => Combinator<T> };
export const oneOf = <T>(...combinators: Combinator<T>[]): OneOf<T> => {
  let generateFn = (combinators: Combinator<T>[]) =>
    debug("oneOf", DebugLevel.Trace, (tokens, startToken) => {
      let error;
      for (let i = 0; i < combinators.length; i++) {
        const combinator = combinators[i];
        try {
          let result = combinator(tokens, startToken);
          if (result.success) {
            return result;
          }
        } catch (e) {
          if (!(e instanceof JsonTemplateError)) {
            throw e;
          }
          error = e;
        }
      }

      if (error) {
        throw error;
      }

      return simpleFailure();
    });

  let response = generateFn(combinators) as OneOf<T>;
  response.except = (...exceptCombinators: Combinator<T>[]) => {
    // console.log("FILTERING EXCEPT");
    const newCombinators = combinators.filter((v) => (exceptCombinators || []).indexOf(v) === -1);
    // console.log(`EXCEPT RETAINED ${newCombinators.length} OF ${combinators.length}`);
    return generateFn(newCombinators);
  };
  return response;
};

export const maybe = <T>(combinator: Combinator<T>): Combinator<T> => {
  return debug("maybe", DebugLevel.Trace, (tokens, startToken) => {
    try {
      let result = combinator(tokens, startToken);

      return {
        success: true,
        type: CoreType.MaybeType,
        startToken,
        endToken: result.success ? result.endToken : startToken - 1,
        value: result.success ? result : undefined,
      } as CombinatorSuccessStatus<T>;
    } catch (e) {
      if (!(e instanceof JsonTemplateError)) {
        throw e;
      }
      return {
        success: true,
        type: CoreType.MaybeType,
        startToken,
        endToken: startToken - 1,
        value: undefined,
      };
    }
  });
};

export const many = <T>(combinator: Combinator<T>): Combinator<T> => {
  return debug("many", DebugLevel.Trace, (tokens, startToken) => {
    let nextIdx = startToken;
    let results: CombinatorStatus<T>[] = [];
    while (true) {
      let result = combinator(tokens, nextIdx);
      if (!result.success) {
        break;
      }

      results.push(result);
      nextIdx = result.endToken + 1;
    }

    return {
      success: true,
      type: CoreType.ManyType,
      value: results,
      startToken,
      endToken: results.length == 0 ? startToken - 1 : nextIdx - 1,
      children: results,
    } as CombinatorSuccessStatus<T>;
  });
};

export const match = <T>(type: TokenType): Combinator<T> => {
  return debug(`match:${type}`, DebugLevel.Trace, (tokens, startToken): CombinatorStatus<T> => {
    if (tokens[startToken].type != type) {
      return simpleFailure();
    }

    return { success: true, startToken, endToken: startToken, type: CoreType.MatchType };
  });
};

export const required = <T>(combinator: Combinator<T>, reason: (tokens: Token[], startIdx: number) => string): Combinator<T> => {
  return debug("required", DebugLevel.Trace, (tokens, startToken) => {
    try {
      let result = combinator(tokens, startToken);
      if (!result.success) {
        throw new JsonTemplateError(reason(tokens, startToken), startToken, startToken);
      }
      return result;
    } catch (e) {
      if (e instanceof JsonTemplateError) {
        throw new JsonTemplateError(reason(tokens, startToken), e.startToken, e.endToken, { cause: e });
      }
      throw e;
    }
  });
};

type LaterType<T> = Combinator<T> & { init: (combinator: Combinator<T>) => void } & {
  except?: (...exceptCombinators: Combinator<T>[]) => Combinator<T>;
};
export const later = <T>(): LaterType<T> => {
  let initCombinator: Combinator<T>;

  const laterCombinator: LaterType<T> = (tokens, startToken) => {
    if (!initCombinator) {
      throw new Error("Cannot call except on uninitialized later combinator");
    }
    return initCombinator(tokens, startToken);
  };

  laterCombinator.init = (combinator: Combinator<T>) => {
    initCombinator = combinator;
  };

  laterCombinator.except = (...exceptCombinators: Combinator<T>[]) => {
    let exceptCombinator: Combinator<T> | undefined = undefined;
    return debug("later.except", DebugLevel.Trace, (tokens, startToken) => {
      if (!initCombinator) {
        throw new Error("Cannot call except on uninitialized later combinator");
      }
      if (exceptCombinator === undefined) {
        if ((initCombinator as any)["except"] === undefined) {
          throw new Error("combinator does not support except");
        }
        exceptCombinator = (initCombinator as LaterType<T>).except!(...exceptCombinators);
      }

      return exceptCombinator(tokens, startToken);
    });
  };

  return laterCombinator;
};
