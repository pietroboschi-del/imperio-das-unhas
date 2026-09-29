import fs from 'node:fs';
import { validateEnvelope } from '../src/migration/envelope-validator';
const file=process.argv[2];if(!file)throw new Error('Uso: npm run import:validate -- envelope.json');
const result=validateEnvelope(JSON.parse(fs.readFileSync(file,'utf8')));console.log(JSON.stringify(result,null,2));process.exit(result.ok?0:1);
