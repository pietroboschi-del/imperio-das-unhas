import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { ImportService } from '../src/migration/import.service';
const file=process.argv[2];const commit=process.argv.includes('--commit');if(!file)throw new Error('Uso: npm run import:envelope -- envelope.json [--commit]');
const prisma=new PrismaClient();const importer=new ImportService(prisma as any);
importer.importEnvelope(JSON.parse(fs.readFileSync(file,'utf8')),commit?'commit':'dry-run').then(x=>console.log(JSON.stringify(x,null,2))).finally(()=>prisma.$disconnect());
