package com.stickerfoundry.app.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import kotlinx.coroutines.flow.Flow

const val EXTRACTION_READY = "READY"
const val EXTRACTION_SYNCING = "SYNCING"
const val EXTRACTION_FAILED = "FAILED"

@Entity(tableName = "packs")
data class PackEntity(
    @PrimaryKey val id: String,
    val name: String,
    val publisher: String,
    val trayImageFile: String,
    val imageDataVersion: String,
    val syncHash: String,
    val localPath: String,
    val isPublic: Boolean,
    val isAnimated: Boolean,
    val isOwner: Boolean,
    val teamId: String?,
    val teamName: String?,
    val role: String?,
    val canEdit: Boolean,
    val canManage: Boolean,
    val stickerCount: Int,
    val updatedAt: String,
    val extractionStatus: String,
    val extractionError: String?,
)

@Entity(
    tableName = "stickers",
    primaryKeys = ["packId", "fileName"],
    foreignKeys = [
        ForeignKey(
            entity = PackEntity::class,
            parentColumns = ["id"],
            childColumns = ["packId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("packId")],
)
data class StickerEntity(
    val packId: String,
    val fileName: String,
    val emojisCsv: String,
    val accessibilityText: String?,
)

@Dao
interface StickerDao {
    @Query("SELECT * FROM packs ORDER BY name")
    fun observePacks(): Flow<List<PackEntity>>

    @Query("SELECT * FROM packs ORDER BY name")
    fun getAllPacksBlocking(): List<PackEntity>

    @Query("SELECT * FROM packs WHERE id = :id LIMIT 1")
    suspend fun getPack(id: String): PackEntity?

    @Query("SELECT * FROM packs WHERE id = :id LIMIT 1")
    fun getPackBlocking(id: String): PackEntity?

    @Query("SELECT * FROM stickers WHERE packId = :packId ORDER BY fileName")
    fun getStickersBlocking(packId: String): List<StickerEntity>

    @Query("SELECT * FROM stickers ORDER BY packId, fileName")
    fun observeStickers(): Flow<List<StickerEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertPack(pack: PackEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertStickers(stickers: List<StickerEntity>)

    @Query("DELETE FROM stickers WHERE packId = :packId")
    suspend fun deleteStickers(packId: String)

    @Query("DELETE FROM packs WHERE id = :packId")
    suspend fun deletePack(packId: String)

    @Query("DELETE FROM packs")
    suspend fun deleteAllPacks()

    @Query("UPDATE packs SET extractionStatus = :status, extractionError = :error WHERE id = :packId")
    suspend fun updateExtractionStatus(packId: String, status: String, error: String?)
}

@Database(entities = [PackEntity::class, StickerEntity::class], version = 8, exportSchema = true)
abstract class LocalDatabase : RoomDatabase() {
    abstract fun stickerDao(): StickerDao

    companion object {
        @Volatile private var instance: LocalDatabase? = null

        private val migration1To2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE packs ADD COLUMN syncHash TEXT NOT NULL DEFAULT ''")
            }
        }

        private val migration2To3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE packs ADD COLUMN isOwner INTEGER NOT NULL DEFAULT 0")
            }
        }

        private val migration3To4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE packs ADD COLUMN stickerCount INTEGER NOT NULL DEFAULT 0")
            }
        }

        private val migration4To5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE packs ADD COLUMN role TEXT")
                db.execSQL("ALTER TABLE packs ADD COLUMN canEdit INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE packs ADD COLUMN canManage INTEGER NOT NULL DEFAULT 0")
                db.execSQL("UPDATE packs SET role = CASE WHEN isOwner = 1 THEN 'OWNER' ELSE 'VIEWER' END")
                db.execSQL("UPDATE packs SET canEdit = CASE WHEN isOwner = 1 THEN 1 ELSE 0 END")
                db.execSQL("UPDATE packs SET canManage = CASE WHEN isOwner = 1 THEN 1 ELSE 0 END")
            }
        }

        private val migration5To6 = object : Migration(5, 6) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE packs ADD COLUMN teamId TEXT")
                db.execSQL("ALTER TABLE packs ADD COLUMN teamName TEXT")
            }
        }

        private val migration6To7 = object : Migration(6, 7) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE packs ADD COLUMN isAnimated INTEGER NOT NULL DEFAULT 0")
            }
        }

        private val migration7To8 = object : Migration(7, 8) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE packs ADD COLUMN extractionStatus TEXT NOT NULL DEFAULT 'READY'")
                db.execSQL("ALTER TABLE packs ADD COLUMN extractionError TEXT")
            }
        }

        fun get(context: Context): LocalDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(context.applicationContext, LocalDatabase::class.java, "stickers.db")
                    .addMigrations(
                        migration1To2,
                        migration2To3,
                        migration3To4,
                        migration4To5,
                        migration5To6,
                        migration6To7,
                        migration7To8,
                    )
                    .build()
                    .also { instance = it }
            }

        fun providerGet(context: Context): LocalDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(context.applicationContext, LocalDatabase::class.java, "stickers.db")
                    .addMigrations(
                        migration1To2,
                        migration2To3,
                        migration3To4,
                        migration4To5,
                        migration5To6,
                        migration6To7,
                        migration7To8,
                    )
                    .allowMainThreadQueries()
                    .build()
                    .also { instance = it }
            }
    }
}
