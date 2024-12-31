# A JSON-to-JSON template language / parser

## Basic Usage

```javascript
import { evaluateTemplate } from "@rouxbot/json-templates";

// Example template:
const template = {
  greeting: "Hello, {{ person.name }}!",
  location: {
    city: "{{ person.location ?? 'Portland' }}",
  },
};

// Example input:
const input = {
  person: {
    name: "Jeremy",
  },
};

// Parse the template:
const result = parseTemplate(template, input);

console.log(result);
```

## Template Syntax

### Literal Interpolation

Embed values (strings, numbers, booleans, null, undefined) directly into the template using `{{ }}`:

```
"Hello, {{ "Greg" }}!"
```

Note: These can also be references to data, not just hard-coded values.

### Nested Interpolation & Pathing

Use dot notation within the interpolation to reference values in the input object:

```
{
  "123": "{{ person.name }}",
}
```

If person is `{ name: "Greg" }`, this resolves to `{ "123": "Greg" }`.

### Square Bracket Notation

Sometimes, you might have keys in your data containing special characters or colons. In that case, you can use bracket notation within `{{ }}`:

```
"{{ formData['faq:question'].value }}"
```

This looks up `formData["faq:question"].value`.

### Ternaries

Use ternary or nullish coalescing (??) operators inline:

```
{
  "123": "{{ person.location ?? 'Portland' }}",
}
```

If person.location is `undefined`, it defaults to `"Portland"`.

You can also use standard JS ternary style:

```
"{{ person.home == 'Portland' ? 'You live in Portland' : 'You live somewhere else' }}"
```

### Equality Checks

Check for equality directly in your template:

"{{ person.name == 'Jeremy' }}"

This will evaluate to a boolean: `true` or `false`.

### Conditionals (`if`, `else if`, `else`)

Only one of the following blocks will be used based on the conditions:

```
{
  "location": {
    "{{ if person.home == 'Portland' }}": "You live in Portland",
    "{{ else if person.home == 'Belmont' }}": "You live in Belmont",
    "{{ else }}": "You live somewhere else",
  },
}
```

The parser inspects these keys in order:

1. if condition
2. else if condition (you can have multiple else ifs)
3. else (default if previous conditions fail)

### Iterators (`each`)

Loop over an array in your data. The `as` keyword lets you name each iteration variable:

```
{
  "{{ each people as person }}": "{{ person.name }}",
}
```

If your input has people: `[ { name: "Jeremy" }, { name: "Greg" } ]`, this snippet produces `["Jeremy", "Greg"]`.

### Flattening Arrays

You can combine `each` with `flatten` to flatten nested arrays:

```
{
  "{{ flatten | each people as person }}": [
    "{{person.name}}",
    "{{person.home}}"
  ],
}
```

This iterates over `people`, producing an array of arrays, and then flattening them into a single array

### Conditional Iteration

Filter arrays with an `if` condition inside the iterator syntax:

```
{
  "{{ flatten | each people as person if person.age > 4 }}": [
    "{{ person.name }}",
    "{{ person.home }}"
  ],
}
```

Only people with `person.age > 4` will be included.

### Spread Operator (`...`)

Merge objects inline to the parent scope. This is especially useful when you have multiple partials or sub-configs that need to be combined:

```
{
  "{{ ... /* first */ }}": {
    "a": 1,
    "b": 2,
    "c": 999
  },
  "{{ ... /* second */ }}": {
    "c": 3,
    "d": 4
  }
}
```

The resulting object merges all properties:

```
{
  "a": 1,
  "b": 2,
  "c": 3,
  "d": 4
}
```

Note: comments are required to create unique keys in the parent json

### Basic Math

Perform arithmetic directly in expressions:

```
"{{ 1 + 2 + 3 + (4 + 5 * person.age) }}"
```

The parser evaluates expressions using standard JavaScript operators.

## API Reference

`evaluateTemplate(template, data)`

- Parameters:
  - `template` _(object | array | string)_: The JSON template to parse. Supports deeply nested structures.
  - `data` _(object)_: The context data to be used for all `{{ }}` interpolations, conditionals, and iterations.
- Returns: A new object (or value) that is the fully evaluated template.
- Example:

```
const result = evaluateTemplate(
  {
    hello: "Hello, {{ user.name }}!",
  },
  {
    user: { name: "World" },
  }
);

console.log(result);
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on GitHub.

## License

MIT
