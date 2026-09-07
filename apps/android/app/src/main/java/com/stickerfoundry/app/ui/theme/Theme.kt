package com.stickerfoundry.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

private val StickerFoundryLightColors = lightColorScheme(
    primary = Color(0xFF0B7F75),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFC7EEE9),
    onPrimaryContainer = Color(0xFF00201D),
    secondary = Color(0xFF4C635F),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFCFE8E3),
    onSecondaryContainer = Color(0xFF08201D),
    background = Color(0xFFF5F7F8),
    onBackground = Color(0xFF192124),
    surface = Color.White,
    onSurface = Color(0xFF192124),
    surfaceVariant = Color(0xFFEDF3F1),
    onSurfaceVariant = Color(0xFF65736F),
    outline = Color(0xFFD8E2DF),
    error = Color(0xFFB42318),
)

private val StickerFoundryDarkColors = darkColorScheme(
    primary = Color(0xFF53D8C8),
    onPrimary = Color(0xFF003732),
    primaryContainer = Color(0xFF005047),
    onPrimaryContainer = Color(0xFFA2F2E7),
    secondary = Color(0xFFB3CCC6),
    onSecondary = Color(0xFF1D3531),
    secondaryContainer = Color(0xFF344C47),
    onSecondaryContainer = Color(0xFFCFE8E3),
    background = Color(0xFF0D1716),
    onBackground = Color(0xFFE0E9E7),
    surface = Color(0xFF12201F),
    onSurface = Color(0xFFE0E9E7),
    surfaceVariant = Color(0xFF20312F),
    onSurfaceVariant = Color(0xFFB1C2BE),
    outline = Color(0xFF71827E),
    error = Color(0xFFFFB4AB),
)

private val StickerFoundryShapes = Shapes(
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(18.dp),
)

@Composable
fun StickerFoundryTheme(darkTheme: Boolean = false, content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (darkTheme) StickerFoundryDarkColors else StickerFoundryLightColors,
        shapes = StickerFoundryShapes,
        content = content,
    )
}
