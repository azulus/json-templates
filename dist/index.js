class JsonTemplateError extends Error {
    startToken;
    endToken;
    jsonPath;
    constructor(message, startToken, endToken, options) {
        super(message, options);
        this.startToken = startToken;
        this.endToken = endToken;
        Object.setPrototypeOf(this, new.target.prototype);
    }
    setPath(jsonPath) {
        this.jsonPath = jsonPath;
    }
}
var CoreType;
(function (CoreType) {
    CoreType["MatchType"] = "MatchType";
    CoreType["ManyType"] = "ManyType";
    CoreType["MaybeType"] = "MaybeType";
})(CoreType || (CoreType = {}));
const simpleFailure = () => ({ success: false });
var DebugLevel;
(function (DebugLevel) {
    DebugLevel[DebugLevel["Trace"] = 0] = "Trace";
    DebugLevel[DebugLevel["Debug"] = 1] = "Debug";
    DebugLevel[DebugLevel["Info"] = 2] = "Info";
    DebugLevel[DebugLevel["Warn"] = 3] = "Warn";
    DebugLevel[DebugLevel["Error"] = 4] = "Error";
})(DebugLevel || (DebugLevel = {}));
const debugStack = [];
let globalDebugLevel = DebugLevel.Warn;
const debugStackToString = () => {
    // render all
    // return debugStack.map((v, i) => (i == debugStack.length - 1 ? v : "  ")).join("");
    return debugStack.join(".");
};
const debug = (combinatorName, debugLevel, combinator) => {
    return (tokens, startToken) => {
        const doLog = (...any) => {
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
            }
            else {
                // doLog(`EXIT(${startToken}): ${debugStackToString()} -> FAILURE`);
            }
            return val;
        }
        catch (e) {
            doLog(`EXIT(${startToken}): ${debugStackToString()} -> ERROR`);
            throw e;
        }
        finally {
            if (debugLevel >= globalDebugLevel) {
                debugStack.pop();
            }
        }
    };
};
const map = (combinator, fn) => {
    return debug("map", DebugLevel.Trace, (tokens, startToken) => {
        const response = combinator(tokens, startToken);
        if (!response.success)
            return response;
        return fn(response);
    });
};
const sequence = (combinators, fn = undefined) => {
    return debug("sequence", DebugLevel.Trace, (tokens, startToken) => {
        let startIdx = startToken;
        let results = [];
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
            ? response
            : {
                startToken,
                endToken: results.length > 0 ? results[results.length - 1].endToken : startToken - 1,
                ...response,
            };
    });
};
const oneOf = (...combinators) => {
    let generateFn = (combinators) => debug("oneOf", DebugLevel.Trace, (tokens, startToken) => {
        let error;
        for (let i = 0; i < combinators.length; i++) {
            const combinator = combinators[i];
            try {
                let result = combinator(tokens, startToken);
                if (result.success) {
                    return result;
                }
            }
            catch (e) {
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
    let response = generateFn(combinators);
    response.except = (...exceptCombinators) => {
        // console.log("FILTERING EXCEPT");
        const newCombinators = combinators.filter((v) => (exceptCombinators || []).indexOf(v) === -1);
        // console.log(`EXCEPT RETAINED ${newCombinators.length} OF ${combinators.length}`);
        return generateFn(newCombinators);
    };
    return response;
};
const maybe = (combinator) => {
    return debug("maybe", DebugLevel.Trace, (tokens, startToken) => {
        try {
            let result = combinator(tokens, startToken);
            return {
                success: true,
                type: CoreType.MaybeType,
                startToken,
                endToken: result.success ? result.endToken : startToken - 1,
                value: result.success ? result : undefined,
            };
        }
        catch (e) {
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
const many = (combinator) => {
    return debug("many", DebugLevel.Trace, (tokens, startToken) => {
        let nextIdx = startToken;
        let results = [];
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
        };
    });
};
const match = (type) => {
    return debug(`match:${type}`, DebugLevel.Trace, (tokens, startToken) => {
        if (tokens[startToken].type != type) {
            return simpleFailure();
        }
        return { success: true, startToken, endToken: startToken, type: CoreType.MatchType };
    });
};
const required = (combinator, reason) => {
    return debug("required", DebugLevel.Trace, (tokens, startToken) => {
        try {
            let result = combinator(tokens, startToken);
            if (!result.success) {
                throw new JsonTemplateError(reason(tokens, startToken), startToken, startToken);
            }
            return result;
        }
        catch (e) {
            if (e instanceof JsonTemplateError) {
                throw new JsonTemplateError(reason(tokens, startToken), e.startToken, e.endToken, { cause: e });
            }
            throw e;
        }
    });
};
const later = () => {
    let initCombinator;
    const laterCombinator = (tokens, startToken) => {
        if (!initCombinator) {
            throw new Error("Cannot call except on uninitialized later combinator");
        }
        return initCombinator(tokens, startToken);
    };
    laterCombinator.init = (combinator) => {
        initCombinator = combinator;
    };
    laterCombinator.except = (...exceptCombinators) => {
        let exceptCombinator = undefined;
        return debug("later.except", DebugLevel.Trace, (tokens, startToken) => {
            if (!initCombinator) {
                throw new Error("Cannot call except on uninitialized later combinator");
            }
            if (exceptCombinator === undefined) {
                if (initCombinator["except"] === undefined) {
                    throw new Error("combinator does not support except");
                }
                exceptCombinator = initCombinator.except(...exceptCombinators);
            }
            return exceptCombinator(tokens, startToken);
        });
    };
    return laterCombinator;
};

class ASTBuilder {
    generateAST(tokens, rootCombinator) {
        console.log("\n\n");
        try {
            let results = rootCombinator(tokens, 0);
            if (!results.success) {
                throw new Error("Failed to parse");
            }
            if (results.startToken != 0 || results.endToken != tokens.length - 1) {
                throw new Error(`Full token range not consumed: ${results.startToken} - ${results.endToken} of ${tokens.length}`);
            }
            return results;
        }
        catch (e) {
            if (e instanceof JsonTemplateError) {
                e.setPath(tokens[e.startToken].jsonPath);
            }
            throw e;
        }
    }
}

var TokenType;
(function (TokenType) {
    TokenType["ObjectStart"] = "ObjectStart";
    TokenType["ObjectEnd"] = "ObjectEnd";
    TokenType["ObjectEntryStart"] = "ObjectEntryStart";
    TokenType["ObjectEntryEnd"] = "ObjectEntryEnd";
    TokenType["ObjectKeyStart"] = "ObjectKeyStart";
    TokenType["ObjectKeyEnd"] = "ObjectKeyEnd";
    TokenType["ValueStart"] = "ValueStart";
    TokenType["ValueEnd"] = "ValueEnd";
    TokenType["ArrayStart"] = "ArrayStart";
    TokenType["ArrayEnd"] = "ArrayEnd";
    TokenType["ArrayEntryStart"] = "ArrayEntryStart";
    TokenType["ArrayEntryEnd"] = "ArrayEntryEnd";
    TokenType["StringLiteralStart"] = "StringLiteralStart";
    TokenType["StringCharacter"] = "StringCharacter";
    TokenType["StringLiteralEnd"] = "StringLiteralEnd";
    TokenType["NumberLiteral"] = "NumberLiteral";
    TokenType["BooleanLiteral"] = "BooleanLiteral";
    TokenType["NullLiteral"] = "NullLiteral";
})(TokenType || (TokenType = {}));
const extendPath = (jsonPath, path, details) => {
    return {
        path: [...jsonPath.path, path],
        details,
    };
};
const TokenGenerator = {
    objectStart: (jsonPath) => ({
        type: TokenType.ObjectStart,
        jsonPath,
    }),
    objectEnd: (jsonPath) => ({
        type: TokenType.ObjectEnd,
        jsonPath,
    }),
    arrayStart: (jsonPath) => ({
        type: TokenType.ArrayStart,
        jsonPath,
    }),
    arrayEnd: (jsonPath) => ({
        type: TokenType.ArrayEnd,
        jsonPath,
    }),
    stringLiteralStart: (jsonPath) => ({
        type: TokenType.StringLiteralStart,
        jsonPath,
    }),
    stringLiteralEnd: (jsonPath) => ({
        type: TokenType.StringLiteralEnd,
        jsonPath,
    }),
    stringCharacter: (jsonPath, value) => ({
        type: TokenType.StringCharacter,
        value,
        jsonPath,
    }),
    numberLiteral: (jsonPath, value) => ({
        type: TokenType.NumberLiteral,
        value,
        jsonPath,
    }),
    booleanLiteral: (jsonPath, value) => ({
        type: TokenType.BooleanLiteral,
        value,
        jsonPath,
    }),
    nullLiteral: (jsonPath) => ({
        type: TokenType.NullLiteral,
        jsonPath,
    }),
    objectEntryStart: (jsonPath) => ({
        type: TokenType.ObjectEntryStart,
        jsonPath,
    }),
    objectEntryEnd: (jsonPath) => ({
        type: TokenType.ObjectEntryEnd,
        jsonPath,
    }),
    objectKeyStart: (jsonPath) => ({
        type: TokenType.ObjectKeyStart,
        jsonPath,
    }),
    objectKeyEnd: (jsonPath) => ({
        type: TokenType.ObjectKeyEnd,
        jsonPath,
    }),
    valueStart: (jsonPath) => ({
        type: TokenType.ValueStart,
        jsonPath,
    }),
    valueEnd: (jsonPath) => ({
        type: TokenType.ValueEnd,
        jsonPath,
    }),
    arrayEntryStart: (jsonPath) => ({
        type: TokenType.ArrayEntryStart,
        jsonPath,
    }),
    arrayEntryEnd: (jsonPath) => ({
        type: TokenType.ArrayEntryEnd,
        jsonPath,
    }),
};
const stringToTokens = (jsonPath, input) => {
    let tokens = [];
    const chars = Array.from(input);
    tokens.push(TokenGenerator.stringLiteralStart(jsonPath));
    chars.forEach((char, i) => {
        tokens.push(TokenGenerator.stringCharacter(extendPath(jsonPath, i), char));
    });
    tokens.push(TokenGenerator.stringLiteralEnd(jsonPath));
    return tokens;
};
class Tokenizer {
    getValueForJsonPath(jsonPath, input) {
        const details = jsonPath.details || {};
        const pathParts = jsonPath.path;
        let value = input;
        if (details.type === "key") {
            return [pathParts[pathParts.length - 1]];
        }
        pathParts.forEach((part, i) => {
            if (typeof part === "number" && Array.isArray(value)) {
                value = value[part];
            }
            else if (typeof value === "object") {
                if (!value) {
                    throw new Error(`Cannot get value for jsonPath ${pathParts.slice(0, i).join(".")} of ${jsonPath}`);
                }
                value = details.type === "key" ? part : value[part];
            }
            else if (typeof value === "string" && typeof part === "number") {
                return value.slice(part);
            }
            else {
                throw new Error(`Error retrieving jsonPath ${pathParts.slice(0, i).join(".")} of ${jsonPath}`);
            }
        });
        return [value];
    }
    toTokens(input, tokens = undefined, _jsonPath = undefined) {
        const jsonPath = _jsonPath || { path: [] };
        let usedTokens = tokens || [];
        if (typeof input === "string") {
            let strTokens = stringToTokens(jsonPath, input);
            usedTokens.push(...strTokens);
        }
        else if (typeof input === "number") {
            usedTokens.push(TokenGenerator.numberLiteral(jsonPath, input));
        }
        else if (typeof input === "boolean") {
            usedTokens.push(TokenGenerator.booleanLiteral(jsonPath, input));
        }
        else if (input === null) {
            usedTokens.push(TokenGenerator.nullLiteral(jsonPath));
        }
        else if (Array.isArray(input)) {
            usedTokens.push(TokenGenerator.arrayStart(jsonPath));
            input.forEach((item, i) => {
                usedTokens.push(TokenGenerator.arrayEntryStart(jsonPath));
                this.toTokens(item, usedTokens, extendPath(jsonPath, i));
                usedTokens.push(TokenGenerator.arrayEntryEnd(jsonPath));
            });
            usedTokens.push(TokenGenerator.arrayEnd(jsonPath));
        }
        else if (typeof input === "object") {
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
        }
        else {
            throw new Error(`Unknown input type ${typeof input}`);
        }
        return [usedTokens, input];
    }
}

var StringType;
(function (StringType) {
    StringType["StringContainer"] = "StringContainer";
    StringType["StringLiteral"] = "StringLiteral";
    StringType["StringCharacter"] = "StringCharacter";
    StringType["RegexpMatch"] = "RegexpMatch";
})(StringType || (StringType = {}));
const fetchNextCharsToString = (tokens, startToken) => {
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
const specificChar = (value) => {
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
const stringUntil = (end) => {
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
const specificString = (value) => {
    return debug("specificString", DebugLevel.Trace, sequence(Array.from(value).map((char) => specificChar(char)), (chars) => {
        return {
            type: StringType.StringLiteral,
            success: true,
            startToken: chars[0].startToken,
            endToken: chars[chars.length - 1].endToken,
            value: chars.map((v) => v.value).join(""),
        };
    }));
};
const regexp = (regex) => {
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

const MagicJsonParams = {
    ConvertUndefinedToNull: "__convertUndefinedToNull",
};
var JsonInterpolatedType;
(function (JsonInterpolatedType) {
    JsonInterpolatedType["NumberLiteral"] = "NumberLiteral";
    JsonInterpolatedType["BooleanLiteral"] = "BooleanLiteral";
    JsonInterpolatedType["NullLiteral"] = "NullLiteral";
    JsonInterpolatedType["UndefinedLiteral"] = "UndefinedLiteral";
    JsonInterpolatedType["VariablePath"] = "VariablePath";
    JsonInterpolatedType["Flatten"] = "Flatten";
    JsonInterpolatedType["Array"] = "Array";
    JsonInterpolatedType["Object"] = "Object";
    JsonInterpolatedType["Property"] = "Property";
    JsonInterpolatedType["TemplateString"] = "TemplateString";
    JsonInterpolatedType["InterpolatedValue"] = "InterpolatedValue";
    JsonInterpolatedType["BinaryExpression"] = "BinaryExpression";
    JsonInterpolatedType["ConditionalStatement"] = "ConditionalStatement";
    JsonInterpolatedType["Condition"] = "Condition";
    JsonInterpolatedType["EachStatement"] = "EachStatement";
    JsonInterpolatedType["TernaryExpression"] = "TernaryExpression";
    JsonInterpolatedType["Comment"] = "Comment";
    JsonInterpolatedType["NullishCoalescingExpression"] = "NullishCoalescingExpression";
    JsonInterpolatedType["MathOperation"] = "MathOperation";
})(JsonInterpolatedType || (JsonInterpolatedType = {}));
let valueType = later();
const whitespaceChar = oneOf(specificChar(" "), specificChar("\t"), specificChar("\n"), specificChar("\r"));
const whitespace = debug("whitespace", DebugLevel.Info, many(whitespaceChar));
const nullStringValue = debug("nullStringValue", DebugLevel.Info, map(specificString("null"), (v) => ({
    ...v,
    type: JsonInterpolatedType.NullLiteral,
    value: undefined,
})));
const undefinedStringValue = debug("undefinedStringValue", DebugLevel.Info, map(specificString("undefined"), (v) => ({
    ...v,
    type: JsonInterpolatedType.UndefinedLiteral,
    value: undefined,
})));
const booleanStringValue = debug("booleanStringValue", DebugLevel.Info, map(oneOf(specificString("true"), specificString("false")), (v) => {
    return {
        ...v,
        type: JsonInterpolatedType.BooleanLiteral,
        value: v.value === "true",
    };
}));
const numberStringValue = debug("numberStringValue", DebugLevel.Info, map(regexp(/\-?[0-9]+(\.[0-9]+)?/), (v) => ({
    ...v,
    type: JsonInterpolatedType.NumberLiteral,
    value: v.value.indexOf(".") !== -1 ? parseFloat(v.value) : parseInt(v.value, 10),
})));
const variableStartRegex = /[a-zA-Z_][0-9a-zA-Z_]*\??/;
const variablePathDotRegex = /\.[0-9a-zA-Z_]+\??/;
const variablePathBracketRegex = /\[\'?([0-9a-zA-Z_\-:]+)\'?\]\??/;
const childVarRegex = new RegExp(`^((${variablePathDotRegex.source})|(${variablePathBracketRegex.source}))`);
const variableNameStringValue = debug("variableNameStringValue", DebugLevel.Info, map(regexp(new RegExp(`(${variableStartRegex.source})(((${variablePathDotRegex.source})|(${variablePathBracketRegex.source}))+)?`)), (v) => {
    if (["true", "false", "null", "undefined"].indexOf(v.value) !== -1) {
        return simpleFailure();
    }
    let counter = 0;
    let matchedPath = v.value;
    let parts = [];
    let match = matchedPath.match(new RegExp(`${variableStartRegex.source}`));
    if (!match || match.index !== 0) {
        throw new Error("Unable to parse variable path: ${matchedPath}");
    }
    parts.push(match[0]);
    let startPos = match[0].length;
    while (startPos < matchedPath.length) {
        const childStr = matchedPath.substring(startPos);
        match = childStr.match(childVarRegex);
        if (!match || match.index !== 0) {
            throw new Error(`Unable to parse variable path: ${childStr}`);
        }
        if (match[0].indexOf(".") === 0) {
            parts.push(match[0].substring(1));
        }
        else if (match[0].indexOf("[") === 0) {
            let matchedChild = match[0].substring(1, match[0].length - 1);
            if (matchedChild.indexOf("'") === 0) {
                matchedChild = matchedChild.substring(1, matchedChild.length - 1);
            }
            parts.push(matchedChild);
        }
        else {
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
}));
const stringInQuotes = debug("stringInQuotes", DebugLevel.Info, sequence([oneOf(regexp(/"(?:[^"\\]|\\.)*"/), regexp(/'(?:[^'\\]|\\.)*'/))], ([match]) => {
    return {
        ...match,
        type: StringType.StringLiteral,
        value: match.value.substring(1, match.value.length - 1),
    };
}));
const spreadOperator = debug("spreadOperator", DebugLevel.Info, sequence([whitespace, specificString("..."), whitespace]));
const pipeOperator = debug("pipeOperator", DebugLevel.Info, sequence([whitespace, specificString("|"), whitespace]));
const flattenKeyword = debug("flattenKeyword", DebugLevel.Info, specificString("flatten"));
const flattenCall = debug("flattenCall", DebugLevel.Info, sequence([flattenKeyword, whitespace, pipeOperator], ([_flattenKeyword, _whitespaceTwo, _pipeOperator]) => {
    return {
        type: JsonInterpolatedType.Flatten,
        success: true,
        startToken: _flattenKeyword.startToken,
        endToken: _pipeOperator.endToken,
    };
}));
const numberLiteral = debug("numberLiteral", DebugLevel.Info, (tokens, startToken) => {
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
});
const booleanLiteral = debug("booleanLiteral", DebugLevel.Info, (tokens, startToken) => {
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
});
const nullLiteral = debug("nullLiteral", DebugLevel.Info, (tokens, startToken) => {
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
});
const arrayEntry = debug("arrayEntry", DebugLevel.Info, sequence([match(TokenType.ArrayEntryStart), valueType, match(TokenType.ArrayEntryEnd)], ([entryStart, entryValue, entryEnd]) => ({
    ...entryValue,
    startToken: entryStart.startToken,
    endToken: entryEnd.endToken,
})));
const array = debug("array", DebugLevel.Info, sequence([
    match(TokenType.ArrayStart),
    required(many(arrayEntry), () => "Arrays may only contain array entries"),
    required(match(TokenType.ArrayEnd), () => "Arrays must end with an array end token"),
], ([arrayStart, arrayEntries, arrayEnd]) => ({
    type: JsonInterpolatedType.Array,
    success: true,
    startToken: arrayStart.startToken,
    endToken: arrayEnd.endToken,
    value: arrayEntries.value,
})));
const interpolatedJson = valueType;
const expressionValueType = later();
const binaryExpression = later();
binaryExpression.init(debug("binaryExpression", DebugLevel.Info, sequence([
    debug("left", DebugLevel.Info, expressionValueType.except(binaryExpression)),
    whitespace,
    required(debug("operator", DebugLevel.Info, oneOf(specificString("==="), specificString("!=="), specificString("=="), specificString("!="), specificString(">="), specificString("<="), specificString(">"), specificString("<"))), () => "Binary expressions must contain an operator"),
    whitespace,
    debug("right", DebugLevel.Info, required(expressionValueType, () => "Binary expressions must contain a right hand side")),
], ([left, , operator, , right]) => {
    return {
        success: true,
        type: JsonInterpolatedType.BinaryExpression,
        operator: operator.value,
        left,
        right,
    };
})));
const ifStatement = debug("ifStatement", DebugLevel.Info, sequence([
    specificString("if"),
    whitespace,
    required(binaryExpression, () => "Conditional statements must contain a binary expression"),
], ([, , expression]) => {
    return {
        success: true,
        type: JsonInterpolatedType.Condition,
        conditionType: "if",
        expression,
    };
}));
const ifElseStatement = debug("ifElseStatement", DebugLevel.Info, sequence([
    oneOf(specificString("ifelse"), specificString("else if")),
    whitespace,
    required(binaryExpression, () => "Conditional statements must contain a binary expression"),
], ([, , expression]) => {
    return {
        success: true,
        type: JsonInterpolatedType.Condition,
        conditionType: "else if",
        expression,
    };
}));
const elseStatement = debug("elseStatement", DebugLevel.Info, sequence([oneOf(specificString("else"))], ([, ,]) => {
    return {
        success: true,
        type: JsonInterpolatedType.Condition,
        conditionType: "else",
    };
}));
const conditionalStatement = debug("conditionalStatement", DebugLevel.Info, sequence([oneOf(ifStatement, ifElseStatement, elseStatement)], ([statement]) => {
    return {
        success: true,
        type: JsonInterpolatedType.ConditionalStatement,
        statement,
    };
}));
const eachStatement = debug("eachStatement", DebugLevel.Info, sequence([
    specificString("each"),
    whitespace,
    variableNameStringValue,
    whitespace,
    specificString("as"),
    whitespace,
    variableNameStringValue,
    whitespace,
    maybe(ifStatement),
], ([_start, , from, , , , to, _, condition]) => {
    if (to.value.length !== 1) {
        throw new Error("Expected a single variable name");
    }
    return {
        success: true,
        type: JsonInterpolatedType.EachStatement,
        from,
        to,
        startToken: _start.startToken,
        endToken: condition.endToken,
        condition: condition.value ?? undefined,
    };
}));
const comment = debug("comment", DebugLevel.Info, sequence([regexp(/\/\*.*?\*\//)], ([comment]) => ({
    ...comment,
    type: JsonInterpolatedType.Comment,
})));
const ternaryExpression = debug("ternaryExpression", DebugLevel.Info, sequence([
    required(binaryExpression, () => "Ternary expressions must contain a binary expression as the first part of the expression"),
    whitespace,
    required(specificString("?"), () => "Ternary expressions must contain a ? as the second part of the expression"),
    whitespace,
    required(expressionValueType, () => "Ternary expressions must contain a comparable value as the third part of the expression"),
    whitespace,
    required(specificString(":"), () => "Ternary expressions must contain a : as the fourth part of the expression"),
    whitespace,
    required(expressionValueType, () => "Ternary expressions must contain a comparable value as the fifth part of the expression"),
], ([condition, , , , trueValue, , , , falseValue]) => {
    return {
        success: true,
        type: JsonInterpolatedType.TernaryExpression,
        condition,
        trueValue,
        falseValue,
    };
}));
const nullishCoalescingExpression = later();
const parensExpression = later();
parensExpression.init(sequence([
    specificChar("("),
    whitespace,
    oneOf(ternaryExpression, nullishCoalescingExpression, expressionValueType.except(parensExpression)),
    whitespace,
    specificChar(")"),
], ([_open, , expression, , _close]) => {
    return {
        ...expression,
        startToken: _open.startToken,
        endToken: _close.endToken,
    };
}));
nullishCoalescingExpression.init(sequence([
    expressionValueType.except(nullishCoalescingExpression),
    whitespace,
    specificString("??"),
    whitespace,
    expressionValueType,
], ([left, , , , right]) => {
    return {
        success: true,
        type: JsonInterpolatedType.NullishCoalescingExpression,
        operator: "??",
        left,
        right,
    };
}));
const mathValueType = later();
const mathOperation = later();
mathOperation.init(debug("mathOperation", DebugLevel.Info, sequence([
    mathValueType.except(mathOperation),
    whitespace,
    oneOf(specificString("+"), specificString("-"), specificString("*"), specificString("/"), specificString("%"), specificString("^")),
    whitespace,
    mathValueType,
], ([left, , operator, , right]) => {
    return {
        success: true,
        type: JsonInterpolatedType.MathOperation,
        operator: operator.value,
        left,
        right,
    };
})));
const mathParensType = later();
mathParensType.init(sequence([specificChar("("), whitespace, mathValueType, whitespace, specificChar(")")], ([_open, , expression, , _close]) => {
    return {
        ...expression,
        startToken: _open.startToken,
        endToken: _close.endToken,
    };
}));
mathValueType.init(oneOf(mathParensType, mathOperation, numberStringValue, variableNameStringValue));
expressionValueType.init(oneOf(parensExpression, binaryExpression, mathValueType, numberStringValue, booleanStringValue, nullStringValue, undefinedStringValue, variableNameStringValue, stringInQuotes));
const interpolatedValue = debug("interpolatedValue", DebugLevel.Info, sequence([
    specificString("{{"),
    whitespace,
    maybe(spreadOperator),
    whitespace,
    many(oneOf(flattenCall)),
    whitespace,
    required(oneOf(conditionalStatement, eachStatement, ternaryExpression, nullishCoalescingExpression, comment, binaryExpression, mathValueType, nullStringValue, undefinedStringValue, booleanStringValue, numberStringValue, variableNameStringValue, stringInQuotes), () => "Unable to read parse value"),
    whitespace,
    maybe(comment),
    whitespace,
    specificString("}}"),
], ([_introCurly, , spread, , calls, , value, , , , _closeCurly]) => {
    return {
        ...value,
        ...(spread.success && spread.value ? { spread: true } : {}),
        ...(calls.success && (calls.value ?? []).length > 0
            ? { modifiers: calls.value }
            : {}),
        startToken: _introCurly.startToken,
        endToken: _closeCurly.endToken,
    };
}));
debug("interpolatedStringLiteral", DebugLevel.Info, sequence([
    match(TokenType.StringLiteralStart),
    required(many(oneOf(interpolatedValue, stringUntil("{{"))), () => "match interpolated values or strings which don't match {{"),
    required(match(TokenType.StringLiteralEnd), () => "Strings must end with an end token"),
], ([arrayStart, chars, arrayEnd]) => ({
    type: JsonInterpolatedType.InterpolatedValue,
    success: true,
    startToken: arrayStart.startToken,
    endToken: arrayEnd.endToken,
    value: chars.children,
    spread: (chars.children ?? []).some((v) => v.spread) ? true : undefined,
})));
const templateStringLiteral = debug("templateStringLiteral", DebugLevel.Info, sequence([
    match(TokenType.StringLiteralStart),
    required(many(oneOf(debug("value", DebugLevel.Info, interpolatedValue), debug("str", DebugLevel.Info, stringUntil("{{")))), () => "match interpolated values or strings which don't match {{"),
    required(match(TokenType.StringLiteralEnd), () => "Strings must end with an end token"),
], ([arrayStart, chars, arrayEnd]) => {
    const spread = (chars.children ?? []).some((v) => v.spread) ? true : undefined;
    const value = chars.children;
    return {
        type: JsonInterpolatedType.TemplateString,
        success: true,
        startToken: arrayStart.startToken,
        endToken: arrayEnd.endToken,
        value,
        spread,
    };
}));
const objectEntry = debug("objectEntry", DebugLevel.Info, sequence([
    match(TokenType.ObjectEntryStart),
    required(match(TokenType.ObjectKeyStart), () => "Object entry must contain a key"),
    required(templateStringLiteral, () => "Object entry key must contain a string literal"),
    required(match(TokenType.ObjectKeyEnd), () => "Object entry key must end with a key end token"),
    required(match(TokenType.ValueStart), () => "Object entry must contain a value"),
    valueType,
    required(match(TokenType.ValueEnd), () => "Object entry must end with a value end token"),
    required(match(TokenType.ObjectEntryEnd), () => "Object entry must end with an entry end token"),
], ([entryStart, _keyStart, key, _keyEnd, _valueStart, value, _valueEnd, entryEnd]) => ({
    type: JsonInterpolatedType.Property,
    success: true,
    startToken: entryStart.startToken,
    endToken: entryEnd.endToken,
    key: { ...key, isKey: true },
    value,
})));
const object = debug("object", DebugLevel.Info, sequence([
    match(TokenType.ObjectStart),
    required(many(objectEntry), () => "Objects may only contain object entries"),
    required(match(TokenType.ObjectEnd), () => "Objects must end with an object end token"),
], ([objectStart, objectEntries, objectEnd]) => ({
    type: JsonInterpolatedType.Object,
    success: true,
    startToken: objectStart.startToken,
    endToken: objectEnd.endToken,
    entries: objectEntries.value,
})));
valueType.init(required(oneOf(templateStringLiteral, numberLiteral, booleanLiteral, nullLiteral, array, object), () => "Expected one of a template string, number, boolean, null, array or object"));
class UndefinedValueError extends Error {
    path;
    constructor(path) {
        super(`Unable to read key '${path[path.length - 1]}' on undefined value: ${path.slice(0, path.length - 1).join(".")}`);
        this.path = path;
    }
}
const resolveVariable = (variablePath, params) => {
    let current = params;
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
const applyModifiers = (value, modifiers) => {
    if (!modifiers)
        return value;
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
const _jsonInterpolatedASTToValue = (ast, params) => {
    try {
        if (typeof ast === "string" ||
            typeof ast === "number" ||
            typeof ast === "boolean" ||
            ast === null ||
            ast === undefined) {
            return [ast, { params }];
        }
        let defaultOptions = {
            params,
            spread: ast.spread,
            modifiers: ast.modifiers && ast.modifiers.length > 0
                ? ast.modifiers.map((modifier) => {
                    if (modifier.type === JsonInterpolatedType.Flatten) {
                        return { type: "flatten" };
                    }
                    else {
                        throw new Error(`Unknown modifier type ${modifier.type}`);
                    }
                })
                : undefined,
        };
        switch (ast.type) {
            case JsonInterpolatedType.Object: {
                let obj = {};
                let earlyResponse = undefined;
                // flatten in a key turns the object into an array
                // flatten in a value turns the value into an array
                ast.entries.forEach((entry) => {
                    if (earlyResponse)
                        return;
                    const [key, keyOptions] = _jsonInterpolatedASTToValue(entry.key, params);
                    const filtedKeyModifiers = (keyOptions?.modifiers ?? []).filter((m) => m.type === "flatten");
                    if (keyOptions.conditionStatus === true) {
                        let [conditionVal] = _jsonInterpolatedASTToValue(entry.value, { ...keyOptions.params });
                        earlyResponse = [conditionVal, { params, spread: keyOptions.spread }];
                        return;
                    }
                    else if (keyOptions.conditionStatus === false) {
                        return;
                    }
                    let value;
                    if (keyOptions.each) {
                        const { from, to, condition } = keyOptions.each;
                        value = [];
                        from.forEach((v) => {
                            const innerParams = { ...params, [to[0]]: v };
                            if (!condition?.expression || jsonInterpolatedASTToValue(condition.expression, { ...innerParams })) {
                                value.push(jsonInterpolatedASTToValue(entry.value, { ...innerParams }));
                            }
                        });
                        earlyResponse = [applyModifiers(value, filtedKeyModifiers), { params, spread: keyOptions.spread }];
                        return;
                    }
                    else {
                        // key can modify params
                        [value] = _jsonInterpolatedASTToValue(entry.value, { ...keyOptions.params });
                    }
                    value = applyModifiers(value, filtedKeyModifiers);
                    if (keyOptions.spread && !keyOptions.isComment) {
                        earlyResponse = [value, { params, spread: keyOptions.spread }];
                    }
                    else if (keyOptions.isComment && keyOptions.spread) {
                        if (Array.isArray(value)) {
                            if (Object.keys(obj).length > 0) {
                                throw new Error("Unable to spread array after object keys");
                            }
                            if (!Array.isArray(obj)) {
                                obj = [];
                            }
                            obj = [...obj, ...value];
                        }
                        else {
                            if (Array.isArray(obj)) {
                                throw new Error("Unable to spread object after array");
                            }
                            obj = { ...obj, ...value };
                        }
                    }
                    else {
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
                const arr = [];
                ast.value.forEach((entry) => {
                    const [value, valueOptions] = _jsonInterpolatedASTToValue(entry, params);
                    if (valueOptions.spread) {
                        arr.push(...value);
                    }
                    else {
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
                }
                catch (e) {
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
                    }
                    else {
                        return [undefined, { ...defaultOptions, params, conditionStatus: false }];
                    }
                }
                else {
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
                const parts = (Array.isArray(ast.value) ? ast.value : [ast.value]).map((v) => _jsonInterpolatedASTToValue(v, params));
                if (parts.length === 1 && parts[0][1].spread) {
                    return parts[0];
                    // let [val, options] = parts[0];
                    // return [
                    //   applyModifiers(val, options.modifiers ?? []),
                    //   { ...defaultOptions, ...options, modifiers: undefined },
                    // ];
                }
                const str = parts
                    .map((p, i) => {
                    Object.assign(allOptions, p[1]);
                    if (typeof p[0] == "undefined" && !params[MagicJsonParams.ConvertUndefinedToNull] && !ast.isKey) {
                        throw new Error(`Undefined value in template string`);
                    }
                    if (typeof p[0] !== "string" &&
                        typeof p[0] !== "number" &&
                        typeof p[0] !== "boolean" &&
                        p[0] !== null &&
                        p[0] !== undefined) {
                        throw new Error(`Unable to stringify value (${i} of ${parts.length}): ${JSON.stringify(p[0])} (${typeof p[0]})`);
                    }
                    return p[0];
                })
                    .join("");
                return [str, { ...allOptions, params }];
            }
            default:
                throw new Error(`Unknown type ${ast.type}`);
        }
    }
    catch (e) {
        if (e instanceof UndefinedValueError) {
            throw e;
        }
        if (e instanceof JsonTemplateError) {
            throw e;
        }
        throw new JsonTemplateError(`${ast.type}: ${e.message}`, ast.startToken, ast.endToken);
    }
};
const jsonInterpolatedASTToValue = (ast, params) => {
    return _jsonInterpolatedASTToValue(ast, params)[0];
};

class TemplateError extends Error {
    context;
    constructor(message, context) {
        super(message);
        this.context = context;
    }
}
function truncate(str, n) {
    return str.length > n ? str.slice(0, n - 1) + "..." : str;
}
const evaluateTemplate = (obj, params) => {
    let tokenizer = new Tokenizer();
    let tokens = [], input;
    try {
        [tokens, input] = tokenizer.toTokens(obj);
        let astBuilder = new ASTBuilder();
        let ast = astBuilder.generateAST(tokens, interpolatedJson);
        let response = jsonInterpolatedASTToValue(ast, params);
        return response;
    }
    catch (e) {
        if (e instanceof JsonTemplateError) {
            if (!e.jsonPath) {
                console.log("e.startToken", e.startToken, tokens[e.startToken]);
                e.setPath(tokens[e.startToken].jsonPath);
            }
            let [errorNode] = tokenizer.getValueForJsonPath(e.jsonPath, input);
            throw new TemplateError(`Error at ${e.jsonPath?.path.join(".")} (${truncate(JSON.stringify(errorNode), 60)}): ${e.message}`, { cause: e });
        }
        throw e;
    }
};

export { evaluateTemplate };
//# sourceMappingURL=index.js.map
