import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AssetsModule } from '../assets/assets.module';
import { AuthorityModule } from '../authority/authority.module';
import { WaterLevelController } from './water-level.controller';
import { WaterLevelService } from './water-level.service';

@Module({
  imports: [PrismaModule, AssetsModule, AuthorityModule],
  controllers: [WaterLevelController],
  providers: [WaterLevelService],
  exports: [WaterLevelService],
})
export class WaterLevelModule {}
