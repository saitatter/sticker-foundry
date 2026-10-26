package com.stickerfoundry.app.ui

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.PlainTooltip
import androidx.compose.material3.Text
import androidx.compose.material3.TooltipBox
import androidx.compose.material3.TooltipDefaults
import androidx.compose.material3.rememberTooltipState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector

/** Compact actions retain a full touch target, a screen-reader label and a long-press hint. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActionIcon(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    enabled: Boolean = true,
    modifier: Modifier = Modifier,
) {
    TooltipBox(
        positionProvider = TooltipDefaults.rememberPlainTooltipPositionProvider(),
        tooltip = { PlainTooltip { Text(label) } },
        state = rememberTooltipState(),
        modifier = modifier,
    ) {
        IconButton(onClick = onClick, enabled = enabled) {
            Icon(icon, contentDescription = label)
        }
    }
}
