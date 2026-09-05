import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

// Feature modules
import { SourcesModule } from './modules/sources/sources.module.js';
import { CollectionModule } from './modules/collection/collection.module.js';
import { NormalizationModule } from './modules/normalization/normalization.module.js';
import { ManagementModule } from './modules/management/management.module.js';
import { ProductionModule } from './modules/production/production.module.js';
import { MqttModule } from './modules/mqtt/mqtt.module.js';

// Entities
import { DataSource } from './modules/sources/entities/data-source.entity.js';
import { CollectionRun } from './modules/collection/entities/collection-run.entity.js';
import { CanonicalEvent } from './modules/normalization/entities/canonical-event.entity.js';
import { ManagementEvent } from './modules/management/entities/management-event.entity.js';

@Module({
  imports: [
    // ── Configuration ──────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.example'],
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),

    // ── Database ───────────────────────────────────────────────────────────
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>('APP_DB_HOST') || process.env.APP_DB_HOST || 'localhost';
        const port = Number(config.get('APP_DB_PORT') || process.env.APP_DB_PORT || 5434);
        const username = config.get<string>('APP_DB_USERNAME') || process.env.APP_DB_USERNAME || 'celesnity';
        const password = config.get<string>('APP_DB_PASSWORD') || process.env.APP_DB_PASSWORD || 'celesnity_secret';
        const database = config.get<string>('APP_DB_DATABASE') || process.env.APP_DB_DATABASE || 'celesnity_app';

        return {
          type: 'postgres',
          host,
          port,
          username,
          password,
          database,
          entities: [DataSource, CollectionRun, CanonicalEvent, ManagementEvent],
          synchronize: config.get<string>('APP_DB_SYNCHRONIZE', 'true') === 'true',
          autoLoadEntities: true,
          retryAttempts: 10,
          retryDelay: 3000,
          logging: config.get<string>('NODE_ENV') === 'development',
        };
      },
    }),

    // ── Feature modules ────────────────────────────────────────────────────
    SourcesModule,
    CollectionModule,
    NormalizationModule,
    ManagementModule,
    ProductionModule,
    MqttModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
