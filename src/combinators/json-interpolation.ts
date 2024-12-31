import { TokenType } from "../tokens";
import {
  Combinator,
  CoreType,
  DebugLevel,
  JsonTemplateError,
  OneOf,
  debug,
  later,
  many,
  map,
  match,
  maybe,
  oneOf,
  required,
  sequence,
  simpleFailure,
} from "./core";
import { StringType, regexp, specificChar, specificString, stringUntil } from "./string";

export const MagicJsonParams = {
  ConvertUndefinedToNull: "__convertUndefinedToNull",
};

export enum JsonInterpolatedType {
  NumberLiteral = "NumberLiteral",
  BooleanLiteral = "BooleanLiteral",
  NullLiteral = "NullLiteral",
  UndefinedLiteral = "UndefinedLiteral",
  VariablePath = "VariablePath",
  Flatten = "Flatten",
  Array = "Array",
  Object = "Object",
  Property = "Property",
  TemplateString = "TemplateString",
  InterpolatedValue = "InterpolatedValue",

  BinaryExpression = "BinaryExpression",
  ConditionalStatement = "ConditionalStatement",
  Condition = "Condition",
  EachStatement = "EachStatement",
  TernaryExpression = "TernaryExpression",
  Comment = "Comment",
  NullishCoalescingExpression = "NullishCoalescingExpression",
  MathOperation = "MathOperation",
}

export let valueType = later<JsonInterpolatedType | StringType | CoreType>();

export const whitespaceChar = oneOf(specificChar(" "), specificChar("\t"), specificChar("\n"), specificChar("\r"));
export const whitespace = debug("whitespace", DebugLevel.Info, many(whitespaceChar));

export const nullStringValue = debug(
  "nullStringValue",
  DebugLevel.Info,
  map<JsonInterpolatedType | StringType | CoreType>(specificString("null"), (v) => ({
    ...v,
    type: JsonInterpolatedType.NullLiteral,
    value: undefined,
  }))
);
export const undefinedStringValue = debug(
  "undefinedStringValue",
  DebugLevel.Info,
  map<JsonInterpolatedType | StringType | CoreType>(specificString("undefined"), (v) => ({
    ...v,
    type: JsonInterpolatedType.UndefinedLiteral,
    value: undefined,
  }))
);
export const booleanStringValue = debug(
  "booleanStringValue",
  DebugLevel.Info,
  map<JsonInterpolatedType | StringType | CoreType>(oneOf(specificString("true"), specificString("false")), (v) => {
    return {
      ...v,
      type: JsonInterpolatedType.BooleanLiteral,
      value: (v as any).value === "true",
    };
  })
);
export const numberStringValue = debug(
  "numberStringValue",
  DebugLevel.Info,
  map<JsonInterpolatedType | StringType | CoreType>(regexp(/\-?[0-9]+(\.[0-9]+)?/), (v) => ({
    ...v,
    type: JsonInterpolatedType.NumberLiteral,
    value: (v as any).value.indexOf(".") !== -1 ? parseFloat((v as any).value) : parseInt((v as any).value, 10),
  }))
);

const variableStartRegex = /[a-zA-Z_][0-9a-zA-Z_]*\??/;
const variablePathDotRegex = /\.[0-9a-zA-Z_]+\??/;
const variablePathBracketRegex = /\[\'?([0-9a-zA-Z_\-:]+)\'?\]\??/;
const childVarRegex = new RegExp(`^((${variablePathDotRegex.source})|(${variablePathBracketRegex.source}))`);
export const variableNameStringValue = debug(
  "variableNameStringValue",
  DebugLevel.Info,
  map<JsonInterpolatedType | StringType | CoreType>(
    regexp(
      new RegExp(
        `(${variableStartRegex.source})(((${variablePathDotRegex.source})|(${variablePathBracketRegex.source}))+)?`
      )
    ),
    (v) => {
      if (["true", "false", "null", "undefined"].indexOf((v as any).value) !== -1) {
        return simpleFailure();
      }

      let counter = 0;
      let matchedPath = (v as any).value;
      let parts = [];
      let match = matchedPath.match(new RegExp(`${variableStartRegex.source}`));
      if (!match || match.index !== 0) {
        throw new Error("Unable to parse variable path: ${matchedPath}");
      }
      parts.push(match[0]);
      let startPos = match[0].length;
      while (startPos < matchedPath.length) {
        const childStr: string = matchedPath.substring(startPos);
        match = childStr.match(childVarRegex);

        if (!match || match.index !== 0) {
          throw new Error(`Unable to parse variable path: ${childStr}`);
        }

        if (match[0].indexOf(".") === 0) {
          parts.push(match[0].substring(1));
        } else if (match[0].indexOf("[") === 0) {
          let matchedChild = match[0].substring(1, match[0].length - 1);
          if (matchedChild.indexOf("'") === 0) {
            matchedChild = matchedChild.substring(1, matchedChild.length - 1);
          }
          parts.push(matchedChild);
        } else {
          throw new Error(`Unable to parse variable path: ${childStr}`);
        }
        if (match[0].length === 0) {
          throw new Error(`Unable to parse variable path: ${childStr}`);
        }
        startPos += match[0].length;

        if (counter++ > 20) {
          throw new Error("Unable to parse variable path: too many layers deep");
        }
      }
      return {
        ...v,
        type: JsonInterpolatedType.VariablePath,
        value: parts,
      };
    }
  )
);

export const stringInQuotes = debug(
  "stringInQuotes",
  DebugLevel.Info,
  sequence<JsonInterpolatedType | StringType | CoreType>(
    [oneOf(regexp(/"(?:[^"\\]|\\.)*"/), regexp(/'(?:[^'\\]|\\.)*'/))],
    ([match]) => {
      return {
        ...match,
        type: StringType.StringLiteral,
        value: (match as any).value.substring(1, (match as any).value.length - 1),
      };
    }
  )
);

export const spreadOperator = debug(
  "spreadOperator",
  DebugLevel.Info,
  sequence([whitespace, specificString("..."), whitespace])
);
export const pipeOperator = debug(
  "pipeOperator",
  DebugLevel.Info,
  sequence([whitespace, specificString("|"), whitespace])
);
export const flattenKeyword = debug("flattenKeyword", DebugLevel.Info, specificString("flatten"));
export const flattenCall = debug(
  "flattenCall",
  DebugLevel.Info,
  sequence<JsonInterpolatedType | StringType | CoreType>(
    [flattenKeyword, whitespace, pipeOperator],
    ([_flattenKeyword, _whitespaceTwo, _pipeOperator]) => {
      return {
        type: JsonInterpolatedType.Flatten,
        success: true,
        startToken: _flattenKeyword.startToken,
        endToken: _pipeOperator.endToken,
      };
    }
  )
);

export const numberLiteral: Combinator<JsonInterpolatedType> = debug(
  "numberLiteral",
  DebugLevel.Info,
  (tokens, startToken) => {
    const first = tokens[startToken];
    if (first.type != TokenType.NumberLiteral) {
      return simpleFailure();
    }

    return {
      type: JsonInterpolatedType.NumberLiteral,
      success: true,
      value: first.value,
      startToken,
      endToken: startToken,
    };
  }
);

export const booleanLiteral: Combinator<JsonInterpolatedType> = debug(
  "booleanLiteral",
  DebugLevel.Info,
  (tokens, startToken) => {
    const first = tokens[startToken];
    if (first.type != TokenType.BooleanLiteral) {
      return simpleFailure();
    }

    return {
      type: JsonInterpolatedType.BooleanLiteral,
      success: true,
      value: first.value,
      startToken,
      endToken: startToken,
    };
  }
);

export const nullLiteral: Combinator<JsonInterpolatedType> = debug(
  "nullLiteral",
  DebugLevel.Info,
  (tokens, startToken) => {
    const first = tokens[startToken];
    if (first.type != TokenType.NullLiteral) {
      return simpleFailure();
    }

    return {
      type: JsonInterpolatedType.NullLiteral,
      success: true,
      startToken,
      endToken: startToken,
    };
  }
);

export const arrayEntry = debug(
  "arrayEntry",
  DebugLevel.Info,
  sequence<JsonInterpolatedType | StringType | CoreType>(
    [match(TokenType.ArrayEntryStart), valueType, match(TokenType.ArrayEntryEnd)],
    ([entryStart, entryValue, entryEnd]) => ({
      ...entryValue,
      startToken: entryStart.startToken,
      endToken: entryEnd.endToken,
    })
  )
);

export const array = debug(
  "array",
  DebugLevel.Info,
  sequence<JsonInterpolatedType | StringType | CoreType>(
    [
      match(TokenType.ArrayStart),
      required(
        many<JsonInterpolatedType | StringType | CoreType>(arrayEntry),
        () => "Arrays may only contain array entries"
      ),
      required(match(TokenType.ArrayEnd), () => "Arrays must end with an array end token"),
    ],
    ([arrayStart, arrayEntries, arrayEnd]) => ({
      type: JsonInterpolatedType.Array,
      success: true,
      startToken: arrayStart.startToken,
      endToken: arrayEnd.endToken,
      value: (arrayEntries as any).value,
    })
  )
);

export const interpolatedJson = valueType;

export const expressionValueType = later<JsonInterpolatedType | CoreType | StringType>();

export const binaryExpression = later<JsonInterpolatedType | CoreType | StringType>();
binaryExpression.init(
  debug(
    "binaryExpression",
    DebugLevel.Info,
    sequence<JsonInterpolatedType | CoreType | StringType>(
      [
        debug(
          "left",
          DebugLevel.Info,
          (expressionValueType as OneOf<JsonInterpolatedType | CoreType | StringType>).except!(binaryExpression)
        ),
        whitespace,
        required(
          debug(
            "operator",
            DebugLevel.Info,
            oneOf(
              specificString("==="),
              specificString("!=="),
              specificString("=="),
              specificString("!="),
              specificString(">="),
              specificString("<="),
              specificString(">"),
              specificString("<")
            )
          ),
          () => "Binary expressions must contain an operator"
        ),
        whitespace,
        debug(
          "right",
          DebugLevel.Info,
          required(expressionValueType, () => "Binary expressions must contain a right hand side")
        ),
      ],
      ([left, , operator, , right]) => {
        return {
          success: true,
          type: JsonInterpolatedType.BinaryExpression,
          operator: (operator as any).value,
          left,
          right,
        };
      }
    )
  )
);

export const ifStatement = debug(
  "ifStatement",
  DebugLevel.Info,
  sequence<JsonInterpolatedType | CoreType | StringType>(
    [
      specificString("if"),
      whitespace,
      required(binaryExpression, () => "Conditional statements must contain a binary expression"),
    ],
    ([, , expression]) => {
      return {
        success: true,
        type: JsonInterpolatedType.Condition,
        conditionType: "if",
        expression,
      };
    }
  )
);
export const ifElseStatement = debug(
  "ifElseStatement",
  DebugLevel.Info,
  sequence<JsonInterpolatedType | CoreType | StringType>(
    [
      oneOf(specificString("ifelse"), specificString("else if")),
      whitespace,
      required(binaryExpression, () => "Conditional statements must contain a binary expression"),
    ],
    ([, , expression]) => {
      return {
        success: true,
        type: JsonInterpolatedType.Condition,
        conditionType: "else if",
        expression,
      };
    }
  )
);

export const elseStatement = debug(
  "elseStatement",
  DebugLevel.Info,
  sequence<JsonInterpolatedType | CoreType | StringType>([oneOf(specificString("else"))], ([, ,]) => {
    return {
      success: true,
      type: JsonInterpolatedType.Condition,
      conditionType: "else",
    };
  })
);

export const conditionalStatement = debug(
  "conditionalStatement",
  DebugLevel.Info,
  sequence<JsonInterpolatedType | CoreType | StringType>(
    [oneOf(ifStatement, ifElseStatement, elseStatement)],
    ([statement]) => {
      return {
        success: true,
        type: JsonInterpolatedType.ConditionalStatement,
        statement,
      };
    }
  )
);

export const eachStatement = debug(
  "eachStatement",
  DebugLevel.Info,
  sequence<JsonInterpolatedType | CoreType | StringType>(
    [
      specificString("each"),
      whitespace,
      variableNameStringValue,
      whitespace,
      specificString("as"),
      whitespace,
      variableNameStringValue,
      whitespace,
      maybe(ifStatement),
    ],
    ([_start, , from, , , , to, _, condition]) => {
      if ((to as any).value.length !== 1) {
        throw new Error("Expected a single variable name");
      }
      return {
        success: true,
        type: JsonInterpolatedType.EachStatement,
        from,
        to,
        startToken: _start.startToken,
        endToken: condition.endToken,
        condition: (condition as any).value ?? undefined,
      };
    }
  )
);

export const comment = debug(
  "comment",
  DebugLevel.Info,
  sequence<JsonInterpolatedType | CoreType | StringType>([regexp(/\/\*.*?\*\//)], ([comment]) => ({
    ...comment,
    type: JsonInterpolatedType.Comment,
  }))
);

export const ternaryExpression = debug(
  "ternaryExpression",
  DebugLevel.Info,
  sequence<JsonInterpolatedType | CoreType | StringType>(
    [
      required(
        binaryExpression,
        () => "Ternary expressions must contain a binary expression as the first part of the expression"
      ),
      whitespace,
      required(specificString("?"), () => "Ternary expressions must contain a ? as the second part of the expression"),
      whitespace,
      required(
        expressionValueType,
        () => "Ternary expressions must contain a comparable value as the third part of the expression"
      ),
      whitespace,
      required(specificString(":"), () => "Ternary expressions must contain a : as the fourth part of the expression"),
      whitespace,
      required(
        expressionValueType,
        () => "Ternary expressions must contain a comparable value as the fifth part of the expression"
      ),
    ],
    ([condition, , , , trueValue, , , , falseValue]) => {
      return {
        success: true,
        type: JsonInterpolatedType.TernaryExpression,
        condition,
        trueValue,
        falseValue,
      };
    }
  )
);

const nullishCoalescingExpression = later<JsonInterpolatedType | CoreType | StringType>();
export const parensExpression = later<JsonInterpolatedType | CoreType | StringType>();
parensExpression.init(
  sequence(
    [
      specificChar("("),
      whitespace,
      oneOf(
        ternaryExpression,
        nullishCoalescingExpression,
        (expressionValueType as OneOf<JsonInterpolatedType | CoreType | StringType>).except!(parensExpression)
      ),
      whitespace,
      specificChar(")"),
    ],
    ([_open, , expression, , _close]) => {
      return {
        ...expression,
        startToken: _open.startToken,
        endToken: _close.endToken,
      };
    }
  )
);

nullishCoalescingExpression.init(
  sequence(
    [
      (expressionValueType as OneOf<JsonInterpolatedType | CoreType | StringType>).except!(nullishCoalescingExpression),
      whitespace,
      specificString("??"),
      whitespace,
      expressionValueType,
    ],
    ([left, , , , right]) => {
      return {
        success: true,
        type: JsonInterpolatedType.NullishCoalescingExpression,
        operator: "??",
        left,
        right,
      };
    }
  )
);

export const mathValueType = later<JsonInterpolatedType | CoreType | StringType>();

export const mathOperation = later<JsonInterpolatedType | CoreType | StringType>();
mathOperation.init(
  debug(
    "mathOperation",
    DebugLevel.Info,
    sequence<JsonInterpolatedType | CoreType | StringType>(
      [
        (mathValueType as OneOf<JsonInterpolatedType | CoreType | StringType>).except!(mathOperation),
        whitespace,
        oneOf(
          specificString("+"),
          specificString("-"),
          specificString("*"),
          specificString("/"),
          specificString("%"),
          specificString("^")
        ),
        whitespace,
        mathValueType,
      ],
      ([left, , operator, , right]) => {
        return {
          success: true,
          type: JsonInterpolatedType.MathOperation,
          operator: (operator as any).value,
          left,
          right,
        };
      }
    )
  )
);

export const mathParensType = later<JsonInterpolatedType | CoreType | StringType>();
mathParensType.init(
  sequence(
    [specificChar("("), whitespace, mathValueType, whitespace, specificChar(")")],
    ([_open, , expression, , _close]) => {
      return {
        ...expression,
        startToken: _open.startToken,
        endToken: _close.endToken,
      };
    }
  )
);

mathValueType.init(oneOf(mathParensType, mathOperation, numberStringValue, variableNameStringValue));

expressionValueType.init(
  oneOf(
    parensExpression,
    binaryExpression,
    mathValueType,
    numberStringValue,
    booleanStringValue,
    nullStringValue,
    undefinedStringValue,
    variableNameStringValue,
    stringInQuotes
  )
);

export const interpolatedValue = debug(
  "interpolatedValue",
  DebugLevel.Info,
  sequence(
    [
      specificString("{{"),
      whitespace,
      maybe(spreadOperator),
      whitespace,
      many(oneOf(flattenCall)),
      whitespace,
      required(
        oneOf(
          conditionalStatement,
          eachStatement,
          ternaryExpression,
          nullishCoalescingExpression,
          comment,
          binaryExpression,
          mathValueType,
          nullStringValue,
          undefinedStringValue,
          booleanStringValue,
          numberStringValue,
          variableNameStringValue,
          stringInQuotes
        ),
        () => "Unable to read parse value"
      ),
      whitespace,
      maybe(comment),
      whitespace,
      specificString("}}"),
    ],
    ([_introCurly, , spread, , calls, , value, , , , _closeCurly]) => {
      return {
        ...value,
        ...((spread as any).success && (spread as any).value ? { spread: true } : {}),
        ...((calls as any).success && ((calls as any).value ?? []).length > 0
          ? { modifiers: (calls as any).value }
          : {}),
        startToken: _introCurly.startToken,
        endToken: _closeCurly.endToken,
      };
    }
  )
);

export const interpolatedStringLiteral = debug(
  "interpolatedStringLiteral",
  DebugLevel.Info,
  sequence(
    [
      match(TokenType.StringLiteralStart),
      required(
        many(oneOf(interpolatedValue, stringUntil("{{"))),
        () => "match interpolated values or strings which don't match {{"
      ),
      required(match(TokenType.StringLiteralEnd), () => "Strings must end with an end token"),
    ],
    ([arrayStart, chars, arrayEnd]) => ({
      type: JsonInterpolatedType.InterpolatedValue,
      success: true,
      startToken: arrayStart.startToken,
      endToken: arrayEnd.endToken,
      value: (chars as any).children,
      spread: ((chars as any).children ?? []).some((v: any) => v.spread) ? true : undefined,
    })
  )
);

export const templateStringLiteral = debug(
  "templateStringLiteral",
  DebugLevel.Info,
  sequence<JsonInterpolatedType | StringType | CoreType>(
    [
      match(TokenType.StringLiteralStart),
      required(
        many(
          oneOf(debug("value", DebugLevel.Info, interpolatedValue), debug("str", DebugLevel.Info, stringUntil("{{")))
        ),
        () => "match interpolated values or strings which don't match {{"
      ),
      required(match(TokenType.StringLiteralEnd), () => "Strings must end with an end token"),
    ],
    ([arrayStart, chars, arrayEnd]) => {
      const spread = ((chars as any).children ?? []).some((v: any) => v.spread) ? true : undefined;
      const value = (chars as any).children;
      return {
        type: JsonInterpolatedType.TemplateString,
        success: true,
        startToken: arrayStart.startToken,
        endToken: arrayEnd.endToken,
        value,
        spread,
      };
    }
  )
);

export const objectEntry = debug(
  "objectEntry",
  DebugLevel.Info,
  sequence(
    [
      match(TokenType.ObjectEntryStart),
      required(match(TokenType.ObjectKeyStart), () => "Object entry must contain a key"),
      required(templateStringLiteral, () => "Object entry key must contain a string literal"),
      required(match(TokenType.ObjectKeyEnd), () => "Object entry key must end with a key end token"),
      required(match(TokenType.ValueStart), () => "Object entry must contain a value"),
      valueType,
      required(match(TokenType.ValueEnd), () => "Object entry must end with a value end token"),
      required(match(TokenType.ObjectEntryEnd), () => "Object entry must end with an entry end token"),
    ],
    ([entryStart, _keyStart, key, _keyEnd, _valueStart, value, _valueEnd, entryEnd]) => ({
      type: JsonInterpolatedType.Property,
      success: true,
      startToken: entryStart.startToken,
      endToken: entryEnd.endToken,
      key: { ...key, isKey: true },
      value,
    })
  )
);

export const object = debug(
  "object",
  DebugLevel.Info,
  sequence<JsonInterpolatedType | StringType | CoreType>(
    [
      match(TokenType.ObjectStart),
      required(many(objectEntry), () => "Objects may only contain object entries"),
      required(match(TokenType.ObjectEnd), () => "Objects must end with an object end token"),
    ],
    ([objectStart, objectEntries, objectEnd]) => ({
      type: JsonInterpolatedType.Object,
      success: true,
      startToken: objectStart.startToken,
      endToken: objectEnd.endToken,
      entries: (objectEntries as any).value,
    })
  )
);

valueType.init(
  required(
    oneOf<JsonInterpolatedType | StringType | CoreType>(
      templateStringLiteral,
      numberLiteral,
      booleanLiteral,
      nullLiteral,
      array,
      object
    ),
    () => "Expected one of a template string, number, boolean, null, array or object"
  )
);

type ValueOptionsModifiers = { type: "flatten" }[];
type ValueOptions = {
  params: Record<string, any>;
  spread?: boolean;
  isComment?: boolean;
  each?: {
    from: any;
    to: string;
    condition?: any;
  };
  conditionStatus?: boolean;
  modifiers?: ValueOptionsModifiers;
};

export class UndefinedValueError extends Error {
  constructor(public readonly path: string[]) {
    super(
      `Unable to read key '${path[path.length - 1]}' on undefined value: ${path.slice(0, path.length - 1).join(".")}`
    );
  }
}

const resolveVariable = (variablePath: string[], params: Record<string, any>): any => {
  let current: any = params;
  for (let i = 0; i < variablePath.length; i++) {
    const part = variablePath[i];
    const usedPart = part.replace(/\?$/, "");
    const currRoot = usedPart.length !== part.length ? current ?? {} : current;
    if (currRoot === undefined) {
      throw new UndefinedValueError(variablePath.slice(0, i + 1));
    }
    current = current[usedPart];
  }
  return current;
};

const applyModifiers = (value: any, modifiers: { type: "flatten" }[]): any => {
  if (!modifiers) return value;
  let current = value;
  modifiers.forEach((modifier) => {
    switch (modifier.type) {
      case "flatten":
        if (!Array.isArray(current)) {
          throw new Error(`Unable to flatten non-array value ${JSON.stringify(current)}`);
        }
        current = current.flat();
        break;
      default:
        throw new Error(`Unknown modifier type ${modifier.type}`);
    }
  });
  return current;
};

const _jsonInterpolatedASTToValue = (ast: any, params: Record<string, any>): [val: any, options: ValueOptions] => {
  try {
    if (
      typeof ast === "string" ||
      typeof ast === "number" ||
      typeof ast === "boolean" ||
      ast === null ||
      ast === undefined
    ) {
      return [ast, { params }];
    }

    let defaultOptions: ValueOptions = {
      params,
      spread: ast.spread,
      modifiers:
        ast.modifiers && ast.modifiers.length > 0
          ? ast.modifiers.map((modifier: any) => {
              if (modifier.type === JsonInterpolatedType.Flatten) {
                return { type: "flatten" };
              } else {
                throw new Error(`Unknown modifier type ${modifier.type}`);
              }
            })
          : undefined,
    };

    switch (ast.type) {
      case JsonInterpolatedType.Object: {
        let obj: Record<string, any> | any = {};
        let earlyResponse: [any, ValueOptions] | undefined = undefined;

        // flatten in a key turns the object into an array
        // flatten in a value turns the value into an array

        ast.entries.forEach((entry: any) => {
          if (earlyResponse) return;

          const [key, keyOptions] = _jsonInterpolatedASTToValue(entry.key, params);
          const filtedKeyModifiers = (keyOptions?.modifiers ?? []).filter((m) => m.type === "flatten");
          if (keyOptions.conditionStatus === true) {
            let [conditionVal] = _jsonInterpolatedASTToValue(entry.value, { ...keyOptions.params });
            earlyResponse = [conditionVal, { params, spread: keyOptions.spread }];
            return;
          } else if (keyOptions.conditionStatus === false) {
            return;
          }

          let value: any;
          if (keyOptions.each) {
            const { from, to, condition } = keyOptions.each;
            value = [];

            from.forEach((v: any) => {
              const innerParams = { ...params, [to[0]]: v };
              if (!condition?.expression || jsonInterpolatedASTToValue(condition.expression, { ...innerParams })) {
                value.push(jsonInterpolatedASTToValue(entry.value, { ...innerParams }));
              }
            });

            earlyResponse = [applyModifiers(value, filtedKeyModifiers), { params, spread: keyOptions.spread }];
            return;
          } else {
            // key can modify params
            [value] = _jsonInterpolatedASTToValue(entry.value, { ...keyOptions.params });
          }

          value = applyModifiers(value, filtedKeyModifiers);

          if (keyOptions.spread && !keyOptions.isComment) {
            earlyResponse = [value, { params, spread: keyOptions.spread }];
          } else if (keyOptions.isComment && keyOptions.spread) {
            if (Array.isArray(value)) {
              if (Object.keys(obj).length > 0) {
                throw new Error("Unable to spread array after object keys");
              }
              if (!Array.isArray(obj)) {
                obj = [];
              }
              obj = [...obj, ...value];
            } else {
              if (Array.isArray(obj)) {
                throw new Error("Unable to spread object after array");
              }
              obj = { ...obj, ...value };
            }
          } else {
            if (Array.isArray(obj)) {
              throw new Error("Unable to set object keys after a spread");
            }
            obj[key] = value;
          }
        });

        return earlyResponse ?? [obj, { ...defaultOptions, params }];
      }
      case JsonInterpolatedType.Comment:
        return [undefined, { ...defaultOptions, isComment: true, params }];
      case JsonInterpolatedType.Array: {
        const arr: any[] = [];
        ast.value.forEach((entry: any) => {
          const [value, valueOptions] = _jsonInterpolatedASTToValue(entry, params);
          if (valueOptions.spread) {
            arr.push(...value);
          } else {
            arr.push(value);
          }
        });
        return [arr, { ...defaultOptions, params }];
      }
      case JsonInterpolatedType.MathOperation: {
        const [left, leftOptions] = _jsonInterpolatedASTToValue(ast.left, params);
        const [right] = _jsonInterpolatedASTToValue(ast.right, { ...leftOptions.params });
        switch (ast.operator) {
          case "+":
            return [left + right, { ...defaultOptions, params }];
          case "-":
            return [left - right, { ...defaultOptions, params }];
          case "*":
            return [left * right, { ...defaultOptions, params }];
          case "/":
            return [left / right, { ...defaultOptions, params }];
          case "%":
            return [left % right, { ...defaultOptions, params }];
          case "^":
            return [left ** right, { ...defaultOptions, params }];
          default:
            throw new Error(`Unknown operator ${ast.operator}`);
        }
      }
      case JsonInterpolatedType.EachStatement: {
        const { from, to, condition } = ast;
        let iter = resolveVariable(from.value, params);
        let iterArr = Array.isArray(iter) ? iter : [iter];

        // throw new Error("Not implemented");

        return [undefined, { ...defaultOptions, params, each: { from: iterArr, to: to.value, condition } }];
      }
      case JsonInterpolatedType.TernaryExpression: {
        const { condition, trueValue, falseValue } = ast;
        const response = _jsonInterpolatedASTToValue(condition, params)[0]
          ? _jsonInterpolatedASTToValue(trueValue, params)
          : _jsonInterpolatedASTToValue(falseValue, params);
        return [response[0], { ...defaultOptions, params }];
      }
      case JsonInterpolatedType.NullishCoalescingExpression: {
        const { left, right } = ast;
        try {
          const leftVal = _jsonInterpolatedASTToValue(left, params);
          if (typeof leftVal[0] !== "undefined" && leftVal[0] !== null) {
            return leftVal;
          }
        } catch (e) {
          if (!(e instanceof UndefinedValueError)) {
            throw e;
          }
        }
        const response = _jsonInterpolatedASTToValue(right, params);
        return [response[0], { ...defaultOptions, params }];
      }
      case JsonInterpolatedType.ConditionalStatement: {
        const { statement } = ast;
        if (statement.expression) {
          if (_jsonInterpolatedASTToValue(statement.expression, params)[0]) {
            return [undefined, { ...defaultOptions, params, conditionStatus: true }];
          } else {
            return [undefined, { ...defaultOptions, params, conditionStatus: false }];
          }
        } else {
          return [undefined, { ...defaultOptions, params, conditionStatus: true }];
        }
      }
      case JsonInterpolatedType.BinaryExpression: {
        const { left, right, operator } = ast;
        const [leftVal] = _jsonInterpolatedASTToValue(left, params);
        const [rightVal] = _jsonInterpolatedASTToValue(right, params);
        switch (operator) {
          case "===":
            return [leftVal === rightVal, { ...defaultOptions, params }];
          case "!==":
            return [leftVal !== rightVal, { ...defaultOptions, params }];
          case "==":
            return [leftVal == rightVal, { ...defaultOptions, params }];
          case "!=":
            return [leftVal != rightVal, { ...defaultOptions, params }];
          case ">=":
            return [leftVal >= rightVal, { ...defaultOptions, params }];
          case "<=":
            return [leftVal <= rightVal, { ...defaultOptions, params }];
          case ">":
            return [leftVal > rightVal, { ...defaultOptions, params }];
          case "<":
            return [leftVal < rightVal, { ...defaultOptions, params }];
          default:
            throw new Error(`Unknown operator ${operator}`);
        }
      }
      case JsonInterpolatedType.VariablePath:
        return [resolveVariable(ast.value, params), { ...defaultOptions, params }];
      case JsonInterpolatedType.NumberLiteral:
      case JsonInterpolatedType.BooleanLiteral:
      case JsonInterpolatedType.NullLiteral:
      case JsonInterpolatedType.UndefinedLiteral:
      case StringType.StringLiteral:
        return [ast.value, { ...defaultOptions, params }];
      case JsonInterpolatedType.TemplateString: {
        const allOptions = {
          ...defaultOptions,
        };
        const parts = (Array.isArray(ast.value) ? ast.value : [ast.value]).map((v: any) =>
          _jsonInterpolatedASTToValue(v, params)
        );

        if (parts.length === 1 && parts[0][1].spread) {
          return parts[0];
          // let [val, options] = parts[0];
          // return [
          //   applyModifiers(val, options.modifiers ?? []),
          //   { ...defaultOptions, ...options, modifiers: undefined },
          // ];
        }

        const str = parts
          .map((p: any, i: number) => {
            Object.assign(allOptions, p[1]);
            if (typeof p[0] == "undefined" && !params[MagicJsonParams.ConvertUndefinedToNull] && !ast.isKey) {
              throw new Error(`Undefined value in template string`);
            }

            if (
              typeof p[0] !== "string" &&
              typeof p[0] !== "number" &&
              typeof p[0] !== "boolean" &&
              p[0] !== null &&
              p[0] !== undefined
            ) {
              throw new Error(
                `Unable to stringify value (${i} of ${parts.length}): ${JSON.stringify(p[0])} (${typeof p[0]})`
              );
            }
            return p[0];
          })
          .join("");
        return [str, { ...allOptions, params }];
      }
      default:
        throw new Error(`Unknown type ${ast.type}`);
    }
  } catch (e: any) {
    if (e instanceof UndefinedValueError) {
      throw e;
    }
    if (e instanceof JsonTemplateError) {
      throw e;
    }
    throw new JsonTemplateError(`${ast.type}: ${e.message}`, ast.startToken, ast.endToken);
  }
};

export const jsonInterpolatedASTToValue = (ast: any, params: Record<string, any>): any => {
  return _jsonInterpolatedASTToValue(ast, params)[0];
};
