import { Module } from '@nestjs/common';
import { PersonalityService } from './personality.service';
import { PersonalityMemoryService } from './personality-memory.service';
import { PersonalityVectorService } from './personality-vector.service';
import { PersonalityInteractionService } from './personality-interaction.service';
import { PersonalitySettingsService } from './personality-settings.service';
import { DatabaseModule } from '../database/database.module';
import { UserPreferencesModule } from '../user-preferences/user-preferences.module';

@Module({
  imports: [
    DatabaseModule,
    UserPreferencesModule,
  ],
  providers: [
    PersonalityService,
    PersonalityMemoryService,
    PersonalityVectorService,
    PersonalityInteractionService,
    PersonalitySettingsService,
  ],
  exports: [
    PersonalityService,
    PersonalityMemoryService,
    PersonalityVectorService,
    PersonalityInteractionService,
    PersonalitySettingsService,
  ],
})
export class PersonalityModule {}
