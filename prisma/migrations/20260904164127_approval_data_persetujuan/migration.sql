-- CreateTable
CREATE TABLE `database_data_persetujuans` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code_form` VARCHAR(191) NULL,
    `code_data` VARCHAR(191) NULL,
    `level` VARCHAR(191) NULL,
    `nrp` VARCHAR(191) NULL,
    `status` VARCHAR(191) NULL,
    `date_change` DATE NULL,
    `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,

    INDEX `database_data_persetujuans_code_form_code_data_idx`(`code_form`, `code_data`),
    INDEX `database_data_persetujuans_nrp_status_idx`(`nrp`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
