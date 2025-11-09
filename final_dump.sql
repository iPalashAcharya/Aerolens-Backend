/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19-12.0.2-MariaDB, for osx10.20 (arm64)
--
-- Host: mysql-31c42ba6-palashacharya-e21a.d.aivencloud.com    Database: defaultdb
-- ------------------------------------------------------
-- Server version	8.0.35

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*M!100616 SET @OLD_NOTE_VERBOSITY=@@NOTE_VERBOSITY, NOTE_VERBOSITY=0 */;

--
-- Table structure for table `active_token`
--

DROP TABLE IF EXISTS `active_token`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `active_token` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `memberId` int NOT NULL,
  `jti` varchar(36) NOT NULL,
  `tokenFamily` varchar(36) NOT NULL,
  `userAgent` varchar(255) DEFAULT NULL,
  `ipAddress` varchar(45) DEFAULT NULL,
  `createdAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `expiresAt` timestamp NOT NULL,
  `isRevoked` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `jti` (`jti`),
  KEY `idx_member_id` (`memberId`),
  KEY `idx_jti` (`jti`),
  KEY `idx_token_family` (`tokenFamily`),
  KEY `idx_expires_at` (`expiresAt`),
  CONSTRAINT `active_token_ibfk_1` FOREIGN KEY (`memberId`) REFERENCES `member` (`memberId`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=148 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `auditLogs`
--

DROP TABLE IF EXISTS `auditLogs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `auditLogs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `action` enum('CREATE','UPDATE','DELETE') NOT NULL,
  `old_values` json DEFAULT NULL,
  `new_values` json DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `reason` text,
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_timestamp` (`timestamp`),
  CONSTRAINT `auditLogs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `member` (`memberId`)
) ENGINE=InnoDB AUTO_INCREMENT=92 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `candidate`
--

DROP TABLE IF EXISTS `candidate`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `candidate` (
  `candidateId` int NOT NULL AUTO_INCREMENT,
  `candidateName` varchar(100) DEFAULT NULL,
  `contactNumber` varchar(25) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `recruiterName` varchar(100) DEFAULT NULL,
  `jobRole` varchar(100) DEFAULT NULL,
  `currentCTC` int DEFAULT NULL,
  `expectedCTC` int DEFAULT NULL,
  `noticePeriod` int DEFAULT NULL,
  `experienceYears` int DEFAULT NULL,
  `linkedinProfileUrl` varchar(500) DEFAULT NULL,
  `statusId` int DEFAULT '3',
  `createdAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `preferredJobLocation` int DEFAULT NULL,
  `resumeFilename` varchar(255) DEFAULT NULL,
  `resumeOriginalName` varchar(255) DEFAULT NULL,
  `resumeUploadDate` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`candidateId`),
  KEY `fk_candidate_status` (`statusId`),
  KEY `fk_preferred_job_location` (`preferredJobLocation`),
  CONSTRAINT `fk_candidate_status` FOREIGN KEY (`statusId`) REFERENCES `lookup` (`lookupKey`),
  CONSTRAINT `fk_preferred_job_location` FOREIGN KEY (`preferredJobLocation`) REFERENCES `lookup` (`lookupKey`)
) ENGINE=InnoDB AUTO_INCREMENT=70 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `client`
--

DROP TABLE IF EXISTS `client`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `client` (
  `clientId` int NOT NULL AUTO_INCREMENT,
  `clientName` varchar(200) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `address` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `location` point NOT NULL,
  `createdAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`clientId`),
  UNIQUE KEY `clientName` (`clientName`),
  SPATIAL KEY `location` (`location`)
) ENGINE=InnoDB AUTO_INCREMENT=124 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `clientContact`
--

DROP TABLE IF EXISTS `clientContact`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `clientContact` (
  `clientContactId` int NOT NULL AUTO_INCREMENT,
  `contactPersonName` varchar(100) DEFAULT NULL,
  `designation` varchar(100) DEFAULT NULL,
  `phone` varchar(25) DEFAULT NULL,
  `emailAddress` varchar(255) DEFAULT NULL,
  `clientId` int DEFAULT NULL,
  `createdAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`clientContactId`),
  UNIQUE KEY `unique_contact_person` (`contactPersonName`,`phone`,`emailAddress`),
  KEY `fk_clientContact` (`clientId`),
  CONSTRAINT `fk_clientContact` FOREIGN KEY (`clientId`) REFERENCES `client` (`clientId`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `department`
--

DROP TABLE IF EXISTS `department`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `department` (
  `departmentId` int NOT NULL AUTO_INCREMENT,
  `departmentName` varchar(100) DEFAULT NULL,
  `departmentDescription` text,
  `clientId` int DEFAULT NULL,
  `createdAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`departmentId`),
  UNIQUE KEY `unique_department` (`departmentName`,`clientId`),
  KEY `fk_department` (`clientId`),
  CONSTRAINT `fk_department` FOREIGN KEY (`clientId`) REFERENCES `client` (`clientId`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=91 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `jobProfile`
--

DROP TABLE IF EXISTS `jobProfile`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `jobProfile` (
  `jobProfileId` int NOT NULL AUTO_INCREMENT,
  `clientId` int DEFAULT NULL,
  `departmentId` int DEFAULT NULL,
  `jobProfileDescription` text,
  `jobRole` varchar(100) DEFAULT NULL,
  `techSpecification` text,
  `positions` int DEFAULT NULL,
  `receivedOn` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `estimatedCloseDate` timestamp NULL DEFAULT NULL,
  `locationId` int DEFAULT NULL,
  `statusId` int DEFAULT '4',
  PRIMARY KEY (`jobProfileId`),
  UNIQUE KEY `unique_job_requirement` (`clientId`,`departmentId`,`jobRole`),
  KEY `fk_jobProfile_department` (`departmentId`),
  KEY `fk_jobProfile_location` (`locationId`),
  KEY `fk_jobProfile_status` (`statusId`),
  CONSTRAINT `fk_jobProfile_client` FOREIGN KEY (`clientId`) REFERENCES `client` (`clientId`) ON DELETE CASCADE,
  CONSTRAINT `fk_jobProfile_department` FOREIGN KEY (`departmentId`) REFERENCES `department` (`departmentId`) ON DELETE CASCADE,
  CONSTRAINT `fk_jobProfile_location` FOREIGN KEY (`locationId`) REFERENCES `lookup` (`lookupKey`),
  CONSTRAINT `fk_jobProfile_status` FOREIGN KEY (`statusId`) REFERENCES `lookup` (`lookupKey`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lookup`
--

DROP TABLE IF EXISTS `lookup`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `lookup` (
  `tag` varchar(100) DEFAULT NULL,
  `lookupKey` int NOT NULL AUTO_INCREMENT,
  `value` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`lookupKey`),
  UNIQUE KEY `uq_lookup_tag_key_value` (`tag`,`lookupKey`,`value`),
  UNIQUE KEY `unique_tag_value` (`tag`,`value`)
) ENGINE=InnoDB AUTO_INCREMENT=41 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `member`
--

DROP TABLE IF EXISTS `member`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `member` (
  `memberId` int NOT NULL AUTO_INCREMENT,
  `memberName` varchar(100) DEFAULT NULL,
  `memberContact` varchar(25) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `designation` int DEFAULT NULL,
  `isRecruiter` tinyint(1) DEFAULT '0',
  `lastLogin` datetime DEFAULT NULL,
  `isActive` tinyint(1) DEFAULT '1',
  `createdAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`memberId`),
  UNIQUE KEY `unique_email` (`email`),
  UNIQUE KEY `unique_contact` (`memberContact`),
  KEY `designation` (`designation`),
  KEY `idx_member_email` (`email`),
  KEY `idx_member_isActive` (`isActive`),
  CONSTRAINT `member_ibfk_1` FOREIGN KEY (`designation`) REFERENCES `lookup` (`lookupKey`)
) ENGINE=InnoDB AUTO_INCREMENT=445 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `refresh_token`
--

DROP TABLE IF EXISTS `refresh_token`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `refresh_token` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `memberId` int NOT NULL,
  `tokenHash` varchar(255) NOT NULL,
  `tokenFamily` varchar(36) DEFAULT NULL,
  `userAgent` varchar(255) DEFAULT NULL,
  `ipAddress` varchar(50) DEFAULT NULL,
  `issuedAt` datetime DEFAULT CURRENT_TIMESTAMP,
  `expiresAt` datetime NOT NULL,
  `isRevoked` tinyint(1) DEFAULT '0',
  `createdAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_member_token` (`memberId`,`tokenHash`),
  KEY `idx_token_family` (`memberId`,`tokenFamily`),
  CONSTRAINT `refresh_token_ibfk_1` FOREIGN KEY (`memberId`) REFERENCES `member` (`memberId`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=221 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*M!100616 SET NOTE_VERBOSITY=@OLD_NOTE_VERBOSITY */;

-- Dump completed on 2025-11-07 14:47:20
/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19-12.0.2-MariaDB, for osx10.20 (arm64)
--
-- Host: mysql-31c42ba6-palashacharya-e21a.d.aivencloud.com    Database: defaultdb
-- ------------------------------------------------------
-- Server version	8.0.35

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*M!100616 SET @OLD_NOTE_VERBOSITY=@@NOTE_VERBOSITY, NOTE_VERBOSITY=0 */;

--
-- Table structure for table `lookup`
--

DROP TABLE IF EXISTS `lookup`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `lookup` (
  `tag` varchar(100) DEFAULT NULL,
  `lookupKey` int NOT NULL AUTO_INCREMENT,
  `value` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`lookupKey`),
  UNIQUE KEY `uq_lookup_tag_key_value` (`tag`,`lookupKey`,`value`),
  UNIQUE KEY `unique_tag_value` (`tag`,`value`)
) ENGINE=InnoDB AUTO_INCREMENT=41 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lookup`
--

LOCK TABLES `lookup` WRITE;
/*!40000 ALTER TABLE `lookup` DISABLE KEYS */;
set autocommit=0;
INSERT INTO `lookup` VALUES
('candidateStatus',9,'Interview Pending'),
('candidateStatus',10,'Rejected'),
('candidateStatus',8,'Selected'),
('designation',24,'admin'),
('designation',14,'Head Of Engineering'),
('designation',11,'QA Automation Developer'),
('designation',12,'Software Engineer'),
('designation',13,'Sr. PHP Developer'),
('designation',40,'Staff Software Engineer'),
('designation',36,'test-engineer'),
('jobProfileLocation',15,'IDC'),
('jobProfileLocation',22,'Seattle'),
('jobProfileLocation',16,'US'),
('location',1,'Ahmedabad'),
('location',2,'Bangalore'),
('location',3,'San Francisco'),
('new_tag',21,'new_value'),
('profileStatus',6,'Cancelled'),
('profileStatus',5,'Closed'),
('profileStatus',4,'In Progress'),
('profileStatus',7,'Pending'),
('Status',20,'Active'),
('Status',19,'Inactive');
/*!40000 ALTER TABLE `lookup` ENABLE KEYS */;
UNLOCK TABLES;
commit;

--
-- Table structure for table `member`
--

DROP TABLE IF EXISTS `member`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `member` (
  `memberId` int NOT NULL AUTO_INCREMENT,
  `memberName` varchar(100) DEFAULT NULL,
  `memberContact` varchar(25) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `designation` int DEFAULT NULL,
  `isRecruiter` tinyint(1) DEFAULT '0',
  `lastLogin` datetime DEFAULT NULL,
  `isActive` tinyint(1) DEFAULT '1',
  `createdAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`memberId`),
  UNIQUE KEY `unique_email` (`email`),
  UNIQUE KEY `unique_contact` (`memberContact`),
  KEY `designation` (`designation`),
  KEY `idx_member_email` (`email`),
  KEY `idx_member_isActive` (`isActive`),
  CONSTRAINT `member_ibfk_1` FOREIGN KEY (`designation`) REFERENCES `lookup` (`lookupKey`)
) ENGINE=InnoDB AUTO_INCREMENT=445 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `member`
--

LOCK TABLES `member` WRITE;
/*!40000 ALTER TABLE `member` DISABLE KEYS */;
set autocommit=0;
INSERT INTO `member` VALUES
(1,'Palash Acharya','+91-9876543210','palash.acharya@aerolens.in','$2b$12$jcwxUWDiUDtw8qdSSBrAxuoFTkqsRmbTjGYogBL8K1Vdebwuvsuxi',24,1,'2025-11-06 13:08:21',1,'2025-10-21 09:28:42','2025-11-06 13:08:21'),
(420,'Jaival Suthar','+91 9999999999','jaival@testing.com','$2b$12$5BLZgCLdhmwEE1VcPuHjgO1vscX4GkG2ErgY1B9BinrbRxYy6hTlC',24,1,'2025-11-07 08:17:40',1,'2025-10-27 10:28:41','2025-11-07 08:17:40'),
(421,'jignesgh','5098438942','catburry@live.com','$2b$12$mP7S6Nw3iUVrcJXnqUzYg.pM8A4m69NB2NGswc5EtvpCm28k70Sc6',24,0,NULL,1,'2025-10-27 16:56:25','2025-10-27 16:56:25'),
(422,'jee karda','3404342423423','qawy@live.com','$2b$12$8EyKdSOGh/J3VxcdUOfFFumc3p8XRjtVGxv5XKpQCwA5qwf0o/8uS',12,0,NULL,1,'2025-10-27 17:06:23','2025-10-27 17:06:23'),
(423,'John Patel','42342342','jarka@live.com','$2b$12$61jQB/3IEL0SPsO/bQFH8.UAt9AU4owkaLXmL/mh1s6tDz7MAE7v.',12,0,NULL,1,'2025-10-27 18:59:39','2025-10-27 18:59:39'),
(424,'Jeevan','456321567','qartery@live.com','$2b$12$mXYWhDHZDApE/oRmpNXADuGKfZK57siHMOfilOwbaGqWusKEwiFma',12,0,NULL,1,'2025-10-27 20:18:57','2025-10-27 20:18:57'),
(425,'prites','13121312','aks2@live.com','$2b$12$V83fVT7jtkxaFLB.dXXG4u1KAaiTMuOrQnHZQ0Hq3dWmEIbNkozw.',24,0,NULL,1,'2025-10-27 20:38:02','2025-10-27 20:38:02'),
(426,'jee','34224','a@live.com','$2b$12$PI7xr8oi2It2JnrEXqEGiew.yO380aUuEdalxwTgfdYGcLhyAlBSC',24,0,NULL,1,'2025-10-27 20:47:06','2025-10-27 20:47:06'),
(427,'Akish Patel','4321445821','jeevan@live.com','$2b$12$SZWlALH74H3JfFvayOCIoeLnsG8NdC/MjNkcs1QiYzT8LeZ31Z51K',12,0,NULL,1,'2025-10-27 20:59:52','2025-10-27 20:59:52'),
(428,'work patel','3403215678','jaka@live.com','$2b$12$ftIiXuY/KDWzvJUnUkf4RO9zKd1q7WA0QT1eoMRoUeqsSqwzcRuQq',24,0,NULL,1,'2025-10-27 21:00:54','2025-10-27 21:00:54'),
(429,'Aarya Soni','5083404281','astro@live.com','$2b$12$lwL5Uc/WVjixWf9qFOvoWeX3z4F6aRUVsyVVGj6HRk5x8RIo67k62',12,0,'2025-11-06 21:44:58',1,'2025-10-28 13:17:36','2025-11-06 21:44:58'),
(430,'Polash Patel','5084528134','jaivals21@testing.com','$2b$12$vJSXolTa2O5PJXSdMq7dN.ga8wH9UEnCQcRDEsVJSimWbPpq4mHtO',12,0,NULL,1,'2025-11-04 00:21:13','2025-11-04 00:21:13'),
(431,'Weash Patel','5083146617','akshshrad12@gmail.com','$2b$12$XHiWlsKc6YuBELS7cz4qkeDRtjojTT1/v7DcmKsM6Fvkm4gSwLYUS',24,0,NULL,1,'2025-11-04 00:24:18','2025-11-04 00:24:18'),
(432,'Weber  Patel','4321508952314','zxcv@gmail.com','$2b$12$IHLGnU1gbaJJlV1V8ed/XujRg9m9TvauZloOVwRzws6MSnLGElEVm',12,0,NULL,1,'2025-11-04 00:25:07','2025-11-04 00:25:07'),
(433,'kartwheel','7741319204','jaival@live.com','$2b$12$a4J.Ncbyczv3Sx61KjhK.eSZ1trOICHfQS5osHNXzUghhrxvGZvHy',12,0,NULL,1,'2025-11-04 00:29:13','2025-11-04 00:29:13'),
(434,'Elon Musk','9870654322','jaival21@testing.com','$2b$12$Si.jCybY/ABlDdzu.zqROuYj2/heM.Mok/lkU4RE3YT8n8PUv5ahq',12,0,NULL,1,'2025-11-04 13:17:54','2025-11-04 13:17:54'),
(435,'jaishvie','50834402134','jaga@live.com','$2b$12$nuX/L1P7EpMjhvCJQbO8VuvJvoBJWAatf.MUY4PFmgbaX0CU9ZLYS',12,0,NULL,1,'2025-11-04 15:07:14','2025-11-04 15:07:14'),
(436,'Jai shree','34052311456','qart@live.com','$2b$12$h3ct90SK2UrLt97iGo/t8uCKcjLV5Oo3NE0j/Ly7EyEYKDbc8JPY.',36,0,NULL,1,'2025-11-04 15:37:17','2025-11-04 15:37:17'),
(437,'Jaga','5083421404','awe@live.com','$2b$12$QdK4Yzwi3BBnLnNwB4pY4.VogC2gDcrgfZyCSjVs8yO3j56IeTKlm',36,0,NULL,1,'2025-11-04 16:16:15','2025-11-04 16:16:15'),
(438,'jaive','508314616','zxcv12@gmail.com','$2b$12$l4iB2zH.2ALg9pX72vwtF.T6zezyB4ettmd0N2uOInwqBdkU/oRPC',12,0,NULL,1,'2025-11-04 16:26:32','2025-11-04 16:26:32'),
(439,'Paritosh','7748139121','paritosh@live.com','$2b$12$rdKTLO9mIt5q4CAHeGpJn.2ujnEEoeFAY/YbUu.vLbVUiVD7u3TKy',40,0,NULL,1,'2025-11-05 13:19:13','2025-11-05 13:19:13'),
(440,'Spritesh','5083146616','pritesh@outlive.om','$2b$12$3nmdve6W7lj7fYBgqGoC/.XNul8x7HSeA/d4TjMYLMVQFlYRvrycO',14,0,NULL,1,'2025-11-05 21:20:48','2025-11-05 21:20:48'),
(441,'Naren','7749375432','shah@yahoo.com','$2b$12$pR8tme8ZPYndbKftEN.EdO6ZH15ZdQJYpApSoO7D4ZwvAKSlGz4U.',14,0,NULL,1,'2025-11-06 01:57:58','2025-11-06 01:57:58'),
(442,'bkeure','774813921','spritesh@outlook.com','$2b$12$qj0/aTVa68q/KjvPooTZW.DBGdIQiC13W1vNPFMU6LiqwprR17TIa',12,0,NULL,1,'2025-11-06 02:05:13','2025-11-06 02:05:13'),
(443,'jee karda','50831455233','east@live.com','$2b$12$mObCA1.UcvmS0Pou2wQr.eYTDzXWyWnotEBkanOkoJX043p.57DDS',36,0,NULL,1,'2025-11-06 02:08:37','2025-11-06 02:08:37'),
(444,'Jaival Suthar','9725110709','jaival.suthar@aerolens.net','$2b$12$h11H9peOjERwrBaXjTpZCu1fLjYuJNqhXaATMFy1ZsUuwkI5bTFMG',12,0,NULL,1,'2025-11-06 10:08:23','2025-11-06 10:08:23');
/*!40000 ALTER TABLE `member` ENABLE KEYS */;
UNLOCK TABLES;
commit;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*M!100616 SET NOTE_VERBOSITY=@OLD_NOTE_VERBOSITY */;

-- Dump completed on 2025-11-07 14:49:29
