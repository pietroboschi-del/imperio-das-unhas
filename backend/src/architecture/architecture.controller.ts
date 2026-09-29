import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/public.decorator';

@Controller('api/v1')
export class ArchitectureController {
  constructor(private readonly prisma: PrismaService) {}
  @Public()
  @Get('health')
  async health(){await this.prisma.$queryRaw`SELECT 1`;return {ok:true,service:'imperio-backend',release:'V98a',operationalWritesEnabled:String(process.env.OPERATIONAL_WRITES_ENABLED||'false')==='true'};}
  @Get('architecture/readiness')
  async readiness(){
    const [units,users,envelopes,clientUnitLinks]=await Promise.all([this.prisma.unit.count(),this.prisma.user.count(),this.prisma.migrationEnvelope.count({where:{status:'IMPORTED'}}),this.prisma.clientUnitLink.count({where:{active:true}})]);
    return {release:'V98a',database:'postgresql',orm:'prisma',auth:'opaque_server_session',unitAuthorization:'server_side',operationalWritesEnabled:String(process.env.OPERATIONAL_WRITES_ENABLED||'false')==='true',migrationImportEnabled:String(process.env.MIGRATION_IMPORT_ENABLED||'false')==='true',shadowReadsEnabled:String(process.env.SHADOW_READS_ENABLED||'false')==='true',readThroughEnabled:String(process.env.READ_THROUGH_ENABLED||'false')==='true',counts:{units,users,importedEnvelopes:envelopes,clientUnitLinks}};
  }
}
