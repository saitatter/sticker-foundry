package com.stickerfoundry.app.data

internal fun Int.floorMod(divisor: Int): Int = ((this % divisor) + divisor) % divisor
