FEATURE_SCHEMA_VERSION = "1.0.0"

# 30 Landslide features: 8 rainfall, 8 terrain, 5 soil, 4 proximity, 5 physics
FEATURE_MANIFEST = [
    # Rainfall
    ("rainfall_1h", "mm", "imd", "sum", "zero", "none"),
    ("rainfall_24h", "mm", "imd", "sum", "zero", "none"),
    ("rainfall_72h", "mm", "imd", "sum", "zero", "none"),
    ("rainfall_7d", "mm", "imd", "sum", "zero", "none"),
    ("rainfall_15d", "mm", "imd", "sum", "zero", "none"),
    ("rainfall_30d", "mm", "imd", "sum", "zero", "none"),
    ("intensity_1h", "mm/h", "imd", "max", "zero", "none"),
    ("cumulative_antecedent", "mm", "imd", "decay_sum", "zero", "none"),
    
    # Terrain
    ("elevation", "m", "dem", "raw", "mean", "none"),
    ("slope", "deg", "dem", "derivative", "mean", "none"),
    ("aspect", "deg", "dem", "derivative", "mean", "none"),
    ("curvature_plan", "rad/m", "dem", "derivative", "mean", "none"),
    ("curvature_profile", "rad/m", "dem", "derivative", "mean", "none"),
    ("twi", "index", "dem", "derived", "mean", "none"),
    ("spi", "index", "dem", "derived", "mean", "none"),
    ("roughness", "m", "dem", "derived", "mean", "none"),
    
    # Soil
    ("clay_percent", "%", "soil_grid", "raw", "mean", "none"),
    ("sand_percent", "%", "soil_grid", "raw", "mean", "none"),
    ("silt_percent", "%", "soil_grid", "raw", "mean", "none"),
    ("bulk_density", "g/cm3", "soil_grid", "raw", "mean", "none"),
    ("organic_carbon", "g/kg", "soil_grid", "raw", "mean", "none"),
    
    # Proximity
    ("dist_to_road", "m", "osm", "distance", "max", "none"),
    ("dist_to_stream", "m", "osm", "distance", "max", "none"),
    ("dist_to_fault", "m", "geol", "distance", "max", "none"),
    ("land_cover_class", "cat", "modis", "raw", "mode", "none"),
    
    # Physics (Output from Physics module)
    ("fos_dry", "ratio", "physics", "fos", "mean", "none"),
    ("fos_wet", "ratio", "physics", "fos", "mean", "none"),
    ("pore_pressure", "kPa", "physics", "calc", "mean", "none"),
    ("saturation_degree", "%", "physics", "calc", "mean", "none"),
    ("critical_slip_depth", "m", "physics", "calc", "mean", "none")
]

FLOOD_FEATURES = [
    "catchment_area", "main_stream_length", "drainage_density", "mean_slope",
    "rainfall_1h", "rainfall_24h", "rainfall_72h", "curve_number",
    "impervious_percent", "base_flow_index", "time_of_concentration",
    "soil_moisture_deficit", "antecedent_moisture", "stream_order", "channel_slope"
]

FEATURE_NAMES = [f[0] for f in FEATURE_MANIFEST]
PHYSICS_FEATURES = ["fos_dry", "fos_wet", "pore_pressure", "saturation_degree", "critical_slip_depth"]
ENVIRONMENTAL_ONLY_FEATURES = [f for f in FEATURE_NAMES if f not in PHYSICS_FEATURES]

def manifest_as_records():
    return [{"name": f[0], "unit": f[1], "source": f[2], "calculation": f[3], "missing_policy": f[4], "leakage_rule": f[5]} for f in FEATURE_MANIFEST]
