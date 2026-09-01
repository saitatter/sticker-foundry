package com.stickerfoundry.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

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

@Composable
fun StickerFoundryTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = StickerFoundryLightColors,
        content = content,
    )
}