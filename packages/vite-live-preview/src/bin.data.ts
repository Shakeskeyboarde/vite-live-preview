import fs from 'node:fs/promises';

const text = await fs.readFile(`${__dirname}/../package.json`, 'utf8');
const data = JSON.parse(text);

export const version: string = data.version;
export const description: string = data.description;
