import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateTemplate } from "../dist/index.js";

// const assert = require("node:assert").strict;
// const { test } = require("node:test");
// const { evaluateTemplate } = require("../dist/index");

const BASE_TEMPLATE = {
  first: "{{ 1 + 1 }}",
  second: {
    value: "{{ 2 + 2 }}",
  },
  third: [
    "{{ 3 + 3 }}",
    {
      value: "{{ 4 + 4 }}",
    },
  ],
  greetings: [
    "Hello everybody!",
    {
      "{{ ...each people as person }}": "Hello to {{person.name}} from {{person.home}}{{ person.home == 'Portland' ? ' (the best)' : '' }}!",
    },
  ],
  names: {
    "{{ each people as person}}": "{{person.name}}",
  },
  portlandPeople: {
    "{{ each people as person}}": {
      "{{ if person.home == 'Portland' }}": "{{person.name}}",
      "{{ else if person.home == 'Belmont' }}": "Soon to be a Portland person: {{person.name}}",
    },
  },
  belmontPeople: {
    "{{ each people as person}}": {
      "{{ if person.home == 'Belmont' }}": "{{person.name}}",
      "{{ else }}": "Formerly of a neighboring city: {{person.name}}",
    },
  },
  belmontPeopleComprehension: {
    "{{ each people as person if person.home == 'Belmont'}}": "{{person.name}}",
  },
  peopleOrLocations: {
    "{{ ... flatten | each people as person}}": ["{{person.name}}", "{{person.home}}"],
  },
  peopleOrLocationsSpread: {
    "{{ ... flatten | /* rest */ }}": [
      {
        "{{ ... each people as person /* first */}}": ["{{person.name}}", "{{person.home}}"],
      },
      {
        "{{ ... each people as person /* second */}}": ["{{person.home}}", "{{person.name}}"],
      },
    ],
  },
  merge: {
    a: 999,
    e: 5,
    "{{ ... /* first */ }}": {
      a: 1,
      b: 2,
      c: 999,
    },
    "{{ ... /* second */ }}": {
      c: 3,
      d: 4,
    },
  },
  options: "{{ ...args }}",
};

test("should parse and evaluate square bracket values", () => {
  const templateData = {
    formData: {
      "faq:question": { value: "What is the meaning of life?" },
      "faq:answer": { value: "42" },
    },
  };

  assert.deepStrictEqual(
    evaluateTemplate(
      {
        question: "{{formData['faq:question'].value}}",
        answer: "{{formData['faq:answer'].value}}",
      },
      templateData
    ),
    {
      question: templateData.formData["faq:question"].value,
      answer: templateData.formData["faq:answer"].value,
    }
  );
});

test("testing json template on nested json strings", () => {
  const expected = {
    first: "2",
    second: {
      value: "4",
    },
    third: [
      "6",
      {
        value: "8",
      },
    ],
    greetings: ["Hello everybody!", "Hello to Jeremy from Portland (the best)!", "Hello to Greg from Belmont!"],
    names: ["Jeremy", "Greg"],
    portlandPeople: ["Jeremy", "Soon to be a Portland person: Greg"],
    belmontPeople: ["Formerly of a neighboring city: Jeremy", "Greg"],
    belmontPeopleComprehension: ["Greg"],
    peopleOrLocations: ["Jeremy", "Portland", "Greg", "Belmont"],
    peopleOrLocationsSpread: ["Jeremy", "Portland", "Greg", "Belmont", "Portland", "Jeremy", "Belmont", "Greg"],
    merge: {
      a: 1,
      b: 2,
      c: 3,
      d: 4,
      e: 5,
    },
    options: {
      length: 3,
      vars: {
        query: "hello",
      },
    },
  };

  let response = evaluateTemplate(BASE_TEMPLATE, {
    people: [
      {
        name: "Jeremy",
        home: "Portland",
      },
      {
        name: "Greg",
        home: "Belmont",
      },
    ],
    args: {
      length: 3,
      vars: {
        query: "hello",
      },
    },
  });
  assert.deepStrictEqual(response, expected);
});

test("faq example", () => {
  const FAQ_LIST_TEMPLATE = {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "FAQ",
          emoji: true,
        },
      },
      {
        "{{ ... flatten | each questions as question}}": [
          {
            type: "divider",
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*{{question.question}}*\n>{{question.answer}}",
            },
            accessory: {
              type: "button",
              text: {
                type: "plain_text",
                text: "Delete",
                emoji: true,
              },
              value: "{{question.id}}",
              action_id: "{{appSlug}}:delete",
            },
          },
        ],
      },
      {
        type: "divider",
      },
    ],
  };

  assert.deepStrictEqual(
    evaluateTemplate(FAQ_LIST_TEMPLATE, {
      questions: [
        { id: "first", question: "First question", answer: "First answer" },
        { id: "second", question: "Second question", answer: "Second answer" },
        { id: "third", question: "Third question", answer: "Third answer" },
      ],
      appSlug: "faq",
    }),
    {
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "FAQ",
            emoji: true,
          },
        },

        {
          type: "divider",
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*First question*\n>First answer",
          },
          accessory: {
            type: "button",
            text: {
              type: "plain_text",
              text: "Delete",
              emoji: true,
            },
            value: "first",
            action_id: "faq:delete",
          },
        },

        {
          type: "divider",
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Second question*\n>Second answer",
          },
          accessory: {
            type: "button",
            text: {
              type: "plain_text",
              text: "Delete",
              emoji: true,
            },
            value: "second",
            action_id: "faq:delete",
          },
        },

        {
          type: "divider",
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Third question*\n>Third answer",
          },
          accessory: {
            type: "button",
            text: {
              type: "plain_text",
              text: "Delete",
              emoji: true,
            },
            value: "third",
            action_id: "faq:delete",
          },
        },

        {
          type: "divider",
        },
      ],
    }
  );
});

test("nulls test", () => {
  const inputs = {
    users: [
      {
        name: "Greg",
        location: "Belmont",
        type: "SuperDuperAdmin",
        metadata: {
          superpower: "flight",
        },
      },
      {
        name: "Jeremy",
        location: "Portland",
        type: "SuperDuperAdmin",
        metadata: {
          weakness: "kryptonite",
        },
      },
      {
        type: "Anonymous",
      },
    ],
  };

  assert.throws(
    () => {
      evaluateTemplate("{{ users[0].metadata.age }}", inputs);
    },
    /Undefined value in template string/,
    "Should throw error for undefined value"
  );

  assert.throws(
    () => {
      evaluateTemplate("{{ users[0].nonExistentField.age }}", inputs);
    },
    /Unable to read key \'age\' on undefined value: users\.0\.nonExistentField/,
    "Should throw error for undefined value"
  );

  assert.doesNotThrow(() => {
    let output = evaluateTemplate("{{ ... users[0].metadata.age ?? 100 }}", inputs);
    assert.deepStrictEqual(output, 100);
  }, "Should not throw error for undefined value");

  assert.doesNotThrow(() => {
    let output = evaluateTemplate(
      {
        "{{ ... flatten | each users as user if user.type == 'SuperDuperAdmin'}}": "{{user.name}}",
      },
      inputs
    );
    assert.deepStrictEqual(output, ["Greg", "Jeremy"]);
  }, "Should not throw error for undefined value");

  assert.doesNotThrow(() => {
    let output = evaluateTemplate(
      {
        "{{ ... each users as user }}": {
          name: "{{user.name ?? user.type}}",
          superpower: "{{user.metadata?.superpower ?? 'unknown' }}",
          weakness: "{{user.metadata?.weakness ?? 'unknown'}}",
        },
      },
      inputs
    );
    assert.deepStrictEqual(output, [
      {
        name: "Greg",
        superpower: "flight",
        weakness: "unknown",
      },
      {
        name: "Jeremy",
        superpower: "unknown",
        weakness: "kryptonite",
      },
      {
        name: "Anonymous",
        superpower: "unknown",
        weakness: "unknown",
      },
    ]);
  });
});
