export type Parseable =
  | string
  | number
  | boolean
  | null
  | undefined
  | Parseable[]
  | { [key: string | number]: Parseable };

export enum TokenType {
  ObjectStart = "ObjectStart",
  ObjectEnd = "ObjectEnd",
  ObjectEntryStart = "ObjectEntryStart",
  ObjectEntryEnd = "ObjectEntryEnd",
  ObjectKeyStart = "ObjectKeyStart",
  ObjectKeyEnd = "ObjectKeyEnd",
  ValueStart = "ValueStart",
  ValueEnd = "ValueEnd",
  ArrayStart = "ArrayStart",
  ArrayEnd = "ArrayEnd",
  ArrayEntryStart = "ArrayEntryStart",
  ArrayEntryEnd = "ArrayEntryEnd",
  StringLiteralStart = "StringLiteralStart",
  StringCharacter = "StringCharacter",
  StringLiteralEnd = "StringLiteralEnd",
  NumberLiteral = "NumberLiteral",
  BooleanLiteral = "BooleanLiteral",
  NullLiteral = "NullLiteral",
}

export type JsonPath = {
  path: (string | number)[];
  details?: Record<string, any>;
};

const extendPath = (jsonPath: JsonPath, path: string | number, details?: Record<string, any>): JsonPath => {
  return {
    path: [...jsonPath.path, path],
    details,
  };
};

interface TokenBase {
  type: TokenType;
  jsonPath: JsonPath;
}

export type Token = TokenBase &
  (
    | {
        type: TokenType.ObjectStart;
      }
    | {
        type: TokenType.ObjectEnd;
      }
    | {
        type: TokenType.ArrayStart;
      }
    | {
        type: TokenType.ArrayEnd;
      }
    | {
        type: TokenType.StringLiteralStart;
      }
    | {
        type: TokenType.StringLiteralEnd;
      }
    | {
        type: TokenType.StringCharacter;
        value: string;
      }
    | {
        type: TokenType.NumberLiteral;
        value: number;
      }
    | {
        type: TokenType.BooleanLiteral;
        value: boolean;
      }
    | {
        type: TokenType.NullLiteral;
      }
    | {
        type: TokenType.ObjectEntryStart;
      }
    | {
        type: TokenType.ObjectEntryEnd;
      }
    | {
        type: TokenType.ObjectKeyStart;
      }
    | {
        type: TokenType.ObjectKeyEnd;
      }
    | {
        type: TokenType.ValueStart;
      }
    | {
        type: TokenType.ValueEnd;
      }
    | {
        type: TokenType.ArrayEntryStart;
      }
    | {
        type: TokenType.ArrayEntryEnd;
      }
  );

export const TokenGenerator = {
  objectStart: (jsonPath: JsonPath): Token => ({
    type: TokenType.ObjectStart,
    jsonPath,
  }),
  objectEnd: (jsonPath: JsonPath): Token => ({
    type: TokenType.ObjectEnd,
    jsonPath,
  }),
  arrayStart: (jsonPath: JsonPath): Token => ({
    type: TokenType.ArrayStart,
    jsonPath,
  }),
  arrayEnd: (jsonPath: JsonPath): Token => ({
    type: TokenType.ArrayEnd,
    jsonPath,
  }),
  stringLiteralStart: (jsonPath: JsonPath): Token => ({
    type: TokenType.StringLiteralStart,
    jsonPath,
  }),
  stringLiteralEnd: (jsonPath: JsonPath): Token => ({
    type: TokenType.StringLiteralEnd,
    jsonPath,
  }),
  stringCharacter: (jsonPath: JsonPath, value: string): Token => ({
    type: TokenType.StringCharacter,
    value,
    jsonPath,
  }),
  numberLiteral: (jsonPath: JsonPath, value: number): Token => ({
    type: TokenType.NumberLiteral,
    value,
    jsonPath,
  }),
  booleanLiteral: (jsonPath: JsonPath, value: boolean): Token => ({
    type: TokenType.BooleanLiteral,
    value,
    jsonPath,
  }),
  nullLiteral: (jsonPath: JsonPath): Token => ({
    type: TokenType.NullLiteral,
    jsonPath,
  }),
  objectEntryStart: (jsonPath: JsonPath): Token => ({
    type: TokenType.ObjectEntryStart,
    jsonPath,
  }),
  objectEntryEnd: (jsonPath: JsonPath): Token => ({
    type: TokenType.ObjectEntryEnd,
    jsonPath,
  }),
  objectKeyStart: (jsonPath: JsonPath): Token => ({
    type: TokenType.ObjectKeyStart,
    jsonPath,
  }),
  objectKeyEnd: (jsonPath: JsonPath): Token => ({
    type: TokenType.ObjectKeyEnd,
    jsonPath,
  }),
  valueStart: (jsonPath: JsonPath): Token => ({
    type: TokenType.ValueStart,
    jsonPath,
  }),
  valueEnd: (jsonPath: JsonPath): Token => ({
    type: TokenType.ValueEnd,
    jsonPath,
  }),
  arrayEntryStart: (jsonPath: JsonPath): Token => ({
    type: TokenType.ArrayEntryStart,
    jsonPath,
  }),
  arrayEntryEnd: (jsonPath: JsonPath): Token => ({
    type: TokenType.ArrayEntryEnd,
    jsonPath,
  }),
};

const stringToTokens = (jsonPath: JsonPath, input: string): Token[] => {
  let tokens = [];
  const chars = Array.from(input);
  tokens.push(TokenGenerator.stringLiteralStart(jsonPath));
  chars.forEach((char, i) => {
    tokens.push(TokenGenerator.stringCharacter(extendPath(jsonPath, i), char));
  });
  tokens.push(TokenGenerator.stringLiteralEnd(jsonPath));
  return tokens;
};

export class Tokenizer {
  getValueForJsonPath(jsonPath: JsonPath, input: Parseable): [Parseable] {
    const details = jsonPath.details || {};
    const pathParts = jsonPath.path;

    let value = input;

    if (details.type === "key") {
      return [pathParts[pathParts.length - 1]];
    }

    pathParts.forEach((part: string | number, i) => {
      if (typeof part === "number" && Array.isArray(value)) {
        value = value[part];
      } else if (typeof value === "object") {
        if (!value) {
          throw new Error(`Cannot get value for jsonPath ${pathParts.slice(0, i).join(".")} of ${jsonPath}`);
        }
        value = details.type === "key" ? part : value[part as any]!;
      } else if (typeof value === "string" && typeof part === "number") {
        return value.slice(part);
      } else {
        throw new Error(`Error retrieving jsonPath ${pathParts.slice(0, i).join(".")} of ${jsonPath}`);
      }
    });
    return [value];
  }

  toTokens(
    input: Parseable,
    tokens: Token[] | undefined = undefined,
    _jsonPath: JsonPath | undefined = undefined
  ): [Token[], Parseable] {
    const jsonPath = _jsonPath || { path: [] };
    let usedTokens = tokens || [];

    if (typeof input === "string") {
      let strTokens = stringToTokens(jsonPath, input);
      usedTokens.push(...strTokens);
    } else if (typeof input === "number") {
      usedTokens.push(TokenGenerator.numberLiteral(jsonPath, input));
    } else if (typeof input === "boolean") {
      usedTokens.push(TokenGenerator.booleanLiteral(jsonPath, input));
    } else if (input === null) {
      usedTokens.push(TokenGenerator.nullLiteral(jsonPath));
    } else if (Array.isArray(input)) {
      usedTokens.push(TokenGenerator.arrayStart(jsonPath));
      input.forEach((item, i) => {
        usedTokens.push(TokenGenerator.arrayEntryStart(jsonPath));
        this.toTokens(item, usedTokens, extendPath(jsonPath, i));
        usedTokens.push(TokenGenerator.arrayEntryEnd(jsonPath));
      });
      usedTokens.push(TokenGenerator.arrayEnd(jsonPath));
    } else if (typeof input === "object") {
      usedTokens.push(TokenGenerator.objectStart(jsonPath));
      Object.keys(input).forEach((key) => {
        usedTokens.push(TokenGenerator.objectEntryStart(jsonPath));
        usedTokens.push(TokenGenerator.objectKeyStart(jsonPath));
        let strTokens = stringToTokens(extendPath(jsonPath, key, { type: "key" }), key);
        usedTokens.push(...strTokens);
        usedTokens.push(TokenGenerator.objectKeyEnd(jsonPath));
        usedTokens.push(TokenGenerator.valueStart(jsonPath));
        this.toTokens(input[key], usedTokens, extendPath(jsonPath, key, { type: "value" }));
        usedTokens.push(TokenGenerator.valueEnd(jsonPath));
        usedTokens.push(TokenGenerator.objectEntryEnd(jsonPath));
      });
      usedTokens.push(TokenGenerator.objectEnd(jsonPath));
    } else {
      throw new Error(`Unknown input type ${typeof input}`);
    }

    return [usedTokens, input];
  }
}
