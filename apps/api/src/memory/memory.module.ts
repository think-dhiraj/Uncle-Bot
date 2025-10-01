import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PersonalityModule } from '../personality/personality.module';
import { SmartContextService } from './smart-context.service';
import { MemoryCompressionService } from './memory-compression.service';
import { MemoryAnalyticsService } from './memory-analytics.service';

@Module({
  imports: [
    DatabaseModule,
    PersonalityModule,
  ],
  providers: [
    SmartContextService,
    MemoryCompressionService,
    MemoryAnalyticsService,
  ],
  exports: [
    SmartContextService,
    MemoryCompressionService,
    MemoryAnalyticsService,
  ],
})
export class MemoryModule {}
