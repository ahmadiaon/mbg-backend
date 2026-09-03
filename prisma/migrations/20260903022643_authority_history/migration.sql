-- CreateTable
CREATE TABLE `RoleLevel` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `level` INTEGER NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RoleLevel_level_key`(`level`),
    UNIQUE INDEX `RoleLevel_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrganizationUnit` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `parentId` INTEGER NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OrganizationUnit_code_key`(`code`),
    INDEX `OrganizationUnit_parentId_idx`(`parentId`),
    INDEX `OrganizationUnit_type_active_idx`(`type`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Position` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `roleLevelId` INTEGER NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Position_code_key`(`code`),
    INDEX `Position_roleLevelId_idx`(`roleLevelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmploymentStatus` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `employeeNrp` VARCHAR(191) NOT NULL,
    `statusCode` VARCHAR(191) NOT NULL,
    `roleLevelId` INTEGER NOT NULL,
    `positionId` INTEGER NULL,
    `companyId` INTEGER NULL,
    `projectId` INTEGER NULL,
    `departmentId` INTEGER NULL,
    `divisionId` INTEGER NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NULL,
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EmploymentStatus_userId_statusCode_idx`(`userId`, `statusCode`),
    INDEX `EmploymentStatus_employeeNrp_statusCode_idx`(`employeeNrp`, `statusCode`),
    INDEX `EmploymentStatus_roleLevelId_statusCode_idx`(`roleLevelId`, `statusCode`),
    INDEX `EmploymentStatus_companyId_projectId_departmentId_divisionId_idx`(`companyId`, `projectId`, `departmentId`, `divisionId`),
    INDEX `EmploymentStatus_startDate_endDate_idx`(`startDate`, `endDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FeatureDefinition` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `route` VARCHAR(191) NULL,
    `icon` VARCHAR(191) NULL,
    `menuGroup` VARCHAR(191) NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FeatureDefinition_code_key`(`code`),
    INDEX `FeatureDefinition_active_sort_idx`(`active`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FeatureAccessPolicy` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `featureId` INTEGER NOT NULL,
    `roleLevelId` INTEGER NOT NULL,
    `employmentStatusCode` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `canRead` BOOLEAN NOT NULL DEFAULT false,
    `canWrite` BOOLEAN NOT NULL DEFAULT false,
    `canEdit` BOOLEAN NOT NULL DEFAULT false,
    `canDelete` BOOLEAN NOT NULL DEFAULT false,
    `canImport` BOOLEAN NOT NULL DEFAULT false,
    `canExport` BOOLEAN NOT NULL DEFAULT false,
    `canSubmit` BOOLEAN NOT NULL DEFAULT false,
    `canApprove` BOOLEAN NOT NULL DEFAULT false,
    `canReject` BOOLEAN NOT NULL DEFAULT false,
    `canViewHistory` BOOLEAN NOT NULL DEFAULT false,
    `canRestore` BOOLEAN NOT NULL DEFAULT false,
    `scopeType` VARCHAR(191) NOT NULL DEFAULT 'SELF',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FeatureAccessPolicy_roleLevelId_employmentStatusCode_active_idx`(`roleLevelId`, `employmentStatusCode`, `active`),
    UNIQUE INDEX `FeatureAccessPolicy_featureId_roleLevelId_employmentStatusCo_key`(`featureId`, `roleLevelId`, `employmentStatusCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserFeatureAccess` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `featureId` INTEGER NOT NULL,
    `employmentStatusCode` VARCHAR(191) NULL,
    `effect` VARCHAR(191) NOT NULL DEFAULT 'ALLOW',
    `canRead` BOOLEAN NULL,
    `canWrite` BOOLEAN NULL,
    `canEdit` BOOLEAN NULL,
    `canDelete` BOOLEAN NULL,
    `canApprove` BOOLEAN NULL,
    `canViewHistory` BOOLEAN NULL,
    `scopeType` VARCHAR(191) NULL,
    `reason` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NULL,
    `createdBy` INTEGER NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UserFeatureAccess_userId_active_expiresAt_idx`(`userId`, `active`, `expiresAt`),
    INDEX `UserFeatureAccess_featureId_employmentStatusCode_idx`(`featureId`, `employmentStatusCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HistoricalDefinition` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `entityCode` VARCHAR(191) NULL,
    `historyEnabled` BOOLEAN NOT NULL DEFAULT true,
    `approvalRequired` BOOLEAN NOT NULL DEFAULT true,
    `workflowId` INTEGER NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `HistoricalDefinition_code_key`(`code`),
    INDEX `HistoricalDefinition_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HistoricalRecord` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `definitionId` INTEGER NOT NULL,
    `recordCode` VARCHAR(191) NOT NULL,
    `currentVersionId` INTEGER NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `createdBy` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `HistoricalRecord_status_definitionId_idx`(`status`, `definitionId`),
    UNIQUE INDEX `HistoricalRecord_definitionId_recordCode_key`(`definitionId`, `recordCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HistoricalVersion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `recordId` INTEGER NOT NULL,
    `versionNumber` INTEGER NOT NULL,
    `snapshotJson` JSON NOT NULL,
    `changeReason` VARCHAR(191) NULL,
    `createdBy` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `HistoricalVersion_recordId_createdAt_idx`(`recordId`, `createdAt`),
    UNIQUE INDEX `HistoricalVersion_recordId_versionNumber_key`(`recordId`, `versionNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HistoricalAuditLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `recordId` INTEGER NOT NULL,
    `versionId` INTEGER NULL,
    `action` VARCHAR(191) NOT NULL,
    `fieldCode` VARCHAR(191) NULL,
    `oldValue` JSON NULL,
    `newValue` JSON NULL,
    `reason` VARCHAR(191) NULL,
    `performedBy` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `HistoricalAuditLog_recordId_createdAt_idx`(`recordId`, `createdAt`),
    INDEX `HistoricalAuditLog_performedBy_createdAt_idx`(`performedBy`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApprovalWorkflow` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ApprovalWorkflow_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApprovalWorkflowStep` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `workflowId` INTEGER NOT NULL,
    `stepNumber` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `requiredRoleMin` INTEGER NULL,
    `requiredRoleMax` INTEGER NULL,
    `requiredPermission` VARCHAR(191) NULL,
    `scopeType` VARCHAR(191) NOT NULL DEFAULT 'SELF',
    `approverType` VARCHAR(191) NOT NULL DEFAULT 'ROLE_LEVEL',
    `excludeAdmin` BOOLEAN NOT NULL DEFAULT true,
    `excludeRequester` BOOLEAN NOT NULL DEFAULT true,
    `active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `ApprovalWorkflowStep_workflowId_stepNumber_key`(`workflowId`, `stepNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApprovalInstance` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `historicalRecordId` INTEGER NOT NULL,
    `workflowId` INTEGER NOT NULL,
    `currentStep` INTEGER NOT NULL DEFAULT 1,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `submittedBy` INTEGER NOT NULL,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    INDEX `ApprovalInstance_historicalRecordId_status_idx`(`historicalRecordId`, `status`),
    INDEX `ApprovalInstance_workflowId_currentStep_status_idx`(`workflowId`, `currentStep`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApprovalAction` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `approvalInstanceId` INTEGER NOT NULL,
    `stepNumber` INTEGER NOT NULL,
    `approverUserId` INTEGER NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `note` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ApprovalAction_approvalInstanceId_stepNumber_idx`(`approvalInstanceId`, `stepNumber`),
    INDEX `ApprovalAction_approverUserId_createdAt_idx`(`approverUserId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OrganizationUnit` ADD CONSTRAINT `OrganizationUnit_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `OrganizationUnit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Position` ADD CONSTRAINT `Position_roleLevelId_fkey` FOREIGN KEY (`roleLevelId`) REFERENCES `RoleLevel`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmploymentStatus` ADD CONSTRAINT `EmploymentStatus_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmploymentStatus` ADD CONSTRAINT `EmploymentStatus_roleLevelId_fkey` FOREIGN KEY (`roleLevelId`) REFERENCES `RoleLevel`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmploymentStatus` ADD CONSTRAINT `EmploymentStatus_positionId_fkey` FOREIGN KEY (`positionId`) REFERENCES `Position`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmploymentStatus` ADD CONSTRAINT `EmploymentStatus_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `OrganizationUnit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmploymentStatus` ADD CONSTRAINT `EmploymentStatus_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `OrganizationUnit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmploymentStatus` ADD CONSTRAINT `EmploymentStatus_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `OrganizationUnit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmploymentStatus` ADD CONSTRAINT `EmploymentStatus_divisionId_fkey` FOREIGN KEY (`divisionId`) REFERENCES `OrganizationUnit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeatureAccessPolicy` ADD CONSTRAINT `FeatureAccessPolicy_featureId_fkey` FOREIGN KEY (`featureId`) REFERENCES `FeatureDefinition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeatureAccessPolicy` ADD CONSTRAINT `FeatureAccessPolicy_roleLevelId_fkey` FOREIGN KEY (`roleLevelId`) REFERENCES `RoleLevel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserFeatureAccess` ADD CONSTRAINT `UserFeatureAccess_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserFeatureAccess` ADD CONSTRAINT `UserFeatureAccess_featureId_fkey` FOREIGN KEY (`featureId`) REFERENCES `FeatureDefinition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistoricalDefinition` ADD CONSTRAINT `HistoricalDefinition_workflowId_fkey` FOREIGN KEY (`workflowId`) REFERENCES `ApprovalWorkflow`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistoricalRecord` ADD CONSTRAINT `HistoricalRecord_definitionId_fkey` FOREIGN KEY (`definitionId`) REFERENCES `HistoricalDefinition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistoricalVersion` ADD CONSTRAINT `HistoricalVersion_recordId_fkey` FOREIGN KEY (`recordId`) REFERENCES `HistoricalRecord`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistoricalAuditLog` ADD CONSTRAINT `HistoricalAuditLog_recordId_fkey` FOREIGN KEY (`recordId`) REFERENCES `HistoricalRecord`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistoricalAuditLog` ADD CONSTRAINT `HistoricalAuditLog_performedBy_fkey` FOREIGN KEY (`performedBy`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalWorkflowStep` ADD CONSTRAINT `ApprovalWorkflowStep_workflowId_fkey` FOREIGN KEY (`workflowId`) REFERENCES `ApprovalWorkflow`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalInstance` ADD CONSTRAINT `ApprovalInstance_historicalRecordId_fkey` FOREIGN KEY (`historicalRecordId`) REFERENCES `HistoricalRecord`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalInstance` ADD CONSTRAINT `ApprovalInstance_workflowId_fkey` FOREIGN KEY (`workflowId`) REFERENCES `ApprovalWorkflow`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalAction` ADD CONSTRAINT `ApprovalAction_approvalInstanceId_fkey` FOREIGN KEY (`approvalInstanceId`) REFERENCES `ApprovalInstance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalAction` ADD CONSTRAINT `ApprovalAction_approverUserId_fkey` FOREIGN KEY (`approverUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
