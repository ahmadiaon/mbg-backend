-- AlterTable
ALTER TABLE `fieldshow` ADD COLUMN `tableShowCode` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `historicaldefinition` ADD COLUMN `changeTypeCodeField` VARCHAR(191) NULL,
    ADD COLUMN `changeTypeEntityCode` VARCHAR(191) NULL,
    ADD COLUMN `changeTypeTableField` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `historicalversion` ADD COLUMN `changeType` VARCHAR(191) NULL,
    ADD COLUMN `changeTypeCode` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `HistoricalChangeRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `definitionId` INTEGER NOT NULL,
    `recordId` INTEGER NOT NULL,
    `baseVersionId` INTEGER NULL,
    `oldSnapshotJson` JSON NOT NULL,
    `newSnapshotJson` JSON NOT NULL,
    `changeTypeCode` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `submittedBy` INTEGER NOT NULL,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `HistoricalChangeRequest_definitionId_status_idx`(`definitionId`, `status`),
    INDEX `HistoricalChangeRequest_recordId_createdAt_idx`(`recordId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HistoricalChangeField` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `changeRequestId` INTEGER NOT NULL,
    `entityCode` VARCHAR(191) NOT NULL,
    `fieldCode` VARCHAR(191) NOT NULL,
    `oldValue` JSON NULL,
    `newValue` JSON NULL,

    INDEX `HistoricalChangeField_changeRequestId_idx`(`changeRequestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `FieldShow_entityCode_fieldCode_sort_idx` ON `FieldShow`(`entityCode`, `fieldCode`, `sort`);

-- CreateIndex
CREATE INDEX `FieldShow_tableShowCode_fieldShowCode_idx` ON `FieldShow`(`tableShowCode`, `fieldShowCode`);

-- AddForeignKey
ALTER TABLE `HistoricalChangeRequest` ADD CONSTRAINT `HistoricalChangeRequest_definitionId_fkey` FOREIGN KEY (`definitionId`) REFERENCES `HistoricalDefinition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistoricalChangeRequest` ADD CONSTRAINT `HistoricalChangeRequest_recordId_fkey` FOREIGN KEY (`recordId`) REFERENCES `HistoricalRecord`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistoricalChangeRequest` ADD CONSTRAINT `HistoricalChangeRequest_baseVersionId_fkey` FOREIGN KEY (`baseVersionId`) REFERENCES `HistoricalVersion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistoricalChangeField` ADD CONSTRAINT `HistoricalChangeField_changeRequestId_fkey` FOREIGN KEY (`changeRequestId`) REFERENCES `HistoricalChangeRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
