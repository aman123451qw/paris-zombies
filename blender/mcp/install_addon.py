import bpy, os, addon_utils
src = os.path.join(os.path.dirname(os.path.abspath(__file__)), "blender_mcp_addon.py")
bpy.ops.preferences.addon_install(filepath=src, overwrite=True)
mod = "blender_mcp_addon"
bpy.ops.preferences.addon_enable(module=mod)
prefs = bpy.context.preferences.addons.get(mod)
if prefs and hasattr(prefs.preferences, "telemetry_consent"):
    prefs.preferences.telemetry_consent = False
bpy.ops.wm.save_userpref()
print("ENABLED:", mod in bpy.context.preferences.addons, "telemetry:", getattr(prefs.preferences, "telemetry_consent", None) if prefs else None)
