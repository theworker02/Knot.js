type Greeting = {
  to: string;
};

function greet(input: Greeting): string {
  return `hello, ${input.to}`;
}

console.log(greet({ to: "TypeScript" }));
