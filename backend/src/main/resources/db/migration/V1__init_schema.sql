-- Static game data
CREATE TABLE profession (
    id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE game_server (
    id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE resource (
    id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name  VARCHAR(150) NOT NULL,
    level INTEGER
);

CREATE TABLE item (
    id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name  VARCHAR(150) NOT NULL,
    level INTEGER
);

CREATE TABLE recipe (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    profession_id   BIGINT NOT NULL REFERENCES profession (id),
    result_item_id  BIGINT NOT NULL REFERENCES item (id),
    level           INTEGER
);

CREATE INDEX idx_recipe_profession_level ON recipe (profession_id, level);

CREATE TABLE recipe_ingredient (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recipe_id   BIGINT NOT NULL REFERENCES recipe (id),
    resource_id BIGINT REFERENCES resource (id),
    item_id     BIGINT REFERENCES item (id),
    quantity    INTEGER NOT NULL CHECK (quantity > 0),
    CONSTRAINT chk_recipe_ingredient_target CHECK (
        (resource_id IS NOT NULL AND item_id IS NULL) OR
        (resource_id IS NULL AND item_id IS NOT NULL)
    )
);

-- Dynamic market data (history is kept: rows are never updated)
CREATE TABLE price_observation (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    server_id     BIGINT NOT NULL REFERENCES game_server (id),
    resource_id   BIGINT REFERENCES resource (id),
    item_id       BIGINT REFERENCES item (id),
    quantity_lot  INTEGER NOT NULL CHECK (quantity_lot > 0),
    price         BIGINT NOT NULL CHECK (price >= 0),
    observed_at   TIMESTAMP WITH TIME ZONE NOT NULL,
    source        VARCHAR(50) NOT NULL,
    CONSTRAINT chk_price_observation_target CHECK (
        (resource_id IS NOT NULL AND item_id IS NULL) OR
        (resource_id IS NULL AND item_id IS NOT NULL)
    )
);

CREATE INDEX idx_price_observation_resource ON price_observation (resource_id, server_id, observed_at DESC);
CREATE INDEX idx_price_observation_item ON price_observation (item_id, server_id, observed_at DESC);

CREATE TABLE scan_session (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    server_id    BIGINT NOT NULL REFERENCES game_server (id),
    status       VARCHAR(20) NOT NULL,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE scan_request_item (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    scan_session_id BIGINT NOT NULL REFERENCES scan_session (id),
    resource_id    BIGINT REFERENCES resource (id),
    item_id        BIGINT REFERENCES item (id),
    status         VARCHAR(20) NOT NULL,
    CONSTRAINT chk_scan_request_item_target CHECK (
        (resource_id IS NOT NULL AND item_id IS NULL) OR
        (resource_id IS NULL AND item_id IS NOT NULL)
    )
);
