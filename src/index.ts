// CLI entry point

import { createProgram } from "./cli/commands.js";

const program = createProgram();
program.parseAsync(process.argv);
