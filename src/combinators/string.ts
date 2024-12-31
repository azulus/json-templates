import { Token, TokenType } from "../tokens";
import { Combinator, DebugLevel, debug, sequence, simpleFailure } from "./core";

export enum StringType {
  StringContainer = "StringContainer",
  StringLiteral = "StringLiteral",
  StringCharacter = "StringCharacter",
  RegexpMatch = "RegexpMatch",
}

const fetchNextCharsToString = (tokens: Token[], startToken: number): string | undefined => {
  if (tokens[startToken].type != TokenType.StringCharacter) {
    return undefined;
  }

  let strTokens = [];
  let currToken = startToken;
  while (currToken < tokens.length) {
    const next = tokens[currToken];
    if (next.type != TokenType.StringCharacter) {
      break;
    }

    strTokens.push(next);
    currToken++;
  }

  let matchStr = strTokens.map((v) => v.value).join("");
  return matchStr;
};

export const specificChar = (value: string): Combinator<StringType> => {
  return debug("specificChar", DebugLevel.Trace, (tokens, startToken) => {
    const first = tokens[startToken];
    if (first.type != TokenType.StringCharacter || first.value != value) {
      return simpleFailure();
    }

    return {
      type: StringType.StringCharacter,
      success: true,
      value: first.value,
      startToken,
      endToken: startToken,
    };
  });
};

export const stringUntil = (end: string): Combinator<StringType> => {
  return debug(`stringUntil:${end}`, DebugLevel.Trace, (tokens, startToken) => {
    let matchStr = fetchNextCharsToString(tokens, startToken);
    if (!matchStr || matchStr.length == 0) {
      return simpleFailure();
    }

    let endIdx = matchStr.indexOf(end);
    if (endIdx == 0) {
      return simpleFailure();
    }

    const matchedStr = endIdx >= 0 ? matchStr.substring(0, endIdx) : matchStr;
    let matchChars = Array.from(matchedStr);
    return {
      type: StringType.StringLiteral,
      success: true,
      value: matchedStr,
      startToken,
      endToken: startToken + matchChars.length - 1,
    };
  });
};

export const specificString = (value: string): Combinator<StringType> => {
  return debug(
    "specificString",
    DebugLevel.Trace,
    sequence(
      Array.from(value).map((char) => specificChar(char)),
      (chars) => {
        return {
          type: StringType.StringLiteral,
          success: true,
          startToken: chars[0].startToken,
          endToken: chars[chars.length - 1].endToken,
          value: (chars as any).map((v: any) => (v as any).value).join(""),
        };
      }
    )
  );
};

export const regexp = (regex: RegExp): Combinator<StringType> => {
  return debug("regexp", DebugLevel.Trace, (tokens, startToken) => {
    const first = tokens[startToken];
    if (first.type != TokenType.StringCharacter) {
      return simpleFailure();
    }

    let matchStr = fetchNextCharsToString(tokens, startToken);
    // console.log("MATCHING AGAINST", matchStr);
    if (!matchStr) {
      return simpleFailure();
    }
    let match = matchStr.match(regex);
    // console.log("MATCH?", matchStr, regex, match);
    if (!match || match.index != 0 || match.length == 0) {
      return simpleFailure();
    }

    let matchChars = Array.from(match[0]);
    // console.log("MATCHED", match, "FROM", matchStr, "REGEX", regex);

    return {
      type: StringType.RegexpMatch,
      success: true,
      value: match[0],
      startToken,
      endToken: startToken + matchChars.length - 1,
    };
  });
};
