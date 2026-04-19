export function cliOut(message: string, ...args: unknown[]): void {
  process.stdout.write(formatMessage(message, args) + '\n');
}

export function cliError(message: string, ...args: unknown[]): void {
  process.stderr.write(formatMessage(message, args) + '\n');
}

export function cliWarn(message: string, ...args: unknown[]): void {
  process.stderr.write(formatMessage(message, args) + '\n');
}

function formatMessage(message: string, args: unknown[]): string {
  if (args.length === 0) return message;
  return `${message} ${args.map((a) => JSON.stringify(a)).join(' ')}`;
}
