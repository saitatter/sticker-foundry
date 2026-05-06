package com.example.stickerplatform.data

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
    val isOwner: Boolean,
    val updatedAt: String,
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

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertPack(pack: PackEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertStickers(stickers: List<StickerEntity>)

    @Query("DELETE FROM stickers WHERE packId = :packId")
    suspend fun deleteStickers(packId: String)
}

@Database(entities = [PackEntity::class, StickerEntity::class], version = 3, exportSchema = true)
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

        fun get(context: Context): LocalDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(context.applicationContext, LocalDatabase::class.java, "stickers.db")
                    .addMigrations(migration1To2, migration2To3)
                    .build()
                    .also { instance = it }
            }

        fun providerGet(context: Context): LocalDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(context.applicationContext, LocalDatabase::class.java, "stickers.db")
                    .addMigrations(migration1To2, migration2To3)
                    .allowMainThreadQueries()
                    .build()
                    .also { instance = it }
            }
    }
}
