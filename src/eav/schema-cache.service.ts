import { Injectable } from '@nestjs/common';

@Injectable()
export class SchemaCacheService {
  private cachedMetadata: any = null;
  private lastMetadataTime = 0;

  get(): any | null {
    return this.cachedMetadata;
  }

  set(data: any): void {
    this.cachedMetadata = data;
    this.lastMetadataTime = Date.now();
  }

  invalidate(): void {
    this.cachedMetadata = null;
    this.lastMetadataTime = 0;
  }

  getLastMetadataTime(): number {
    return this.lastMetadataTime;
  }
}
