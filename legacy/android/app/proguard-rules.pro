# Keep Retrofit method metadata and generic signatures used by converters.
-keepattributes Signature, RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations

# Moshi reflection needs model fields and Kotlin metadata for DTO serialization.
-keep class kotlin.Metadata { *; }
-keep class com.stickerfoundry.app.data.**Dto { *; }
-keep class com.stickerfoundry.app.data.**Request { *; }
-keep class com.stickerfoundry.app.data.**Response { *; }
-keepclassmembers class com.stickerfoundry.app.data.** {
    <fields>;
}

# Room and OkHttp may reference optional desktop/server annotations.
-dontwarn javax.annotation.**
-dontwarn org.codehaus.mojo.animal_sniffer.**
