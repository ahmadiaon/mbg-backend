import { Global, Module } from '@nestjs/common';
import { SchemaCacheService } from './schema-cache.service';

@Global()
@Module({
  providers: [SchemaCacheService],
  exports: [SchemaCacheService],
})
export class SchemaCacheModule {}
