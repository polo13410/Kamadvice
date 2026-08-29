package com.kamadvice.backend.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * A single price observation collected in a game HDV. This is
 * dynamic data: rows are only ever inserted, never updated, so the
 * full price history is kept.
 *
 * <p>Exactly one of {@code resource} or {@code item} must be set,
 * enforced by a DB check constraint (see the Flyway migration).
 */
@Entity
@Table(name = "price_observation")
public class PriceObservation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "server_id")
    private GameServer server;

    @ManyToOne
    @JoinColumn(name = "resource_id")
    private Resource resource;

    @ManyToOne
    @JoinColumn(name = "item_id")
    private Item item;

    /** Lot size the price applies to: 1, 10, 100, ... */
    private int quantityLot;

    /** Price in kamas for the whole lot. */
    private long price;

    private Instant observedAt;

    /** Where this observation came from, e.g. "SCANNER", "MANUAL". */
    private String source;

    protected PriceObservation() {
        // JPA
    }

    private PriceObservation(GameServer server, Resource resource, Item item,
            int quantityLot, long price, Instant observedAt, String source) {
        this.server = server;
        this.resource = resource;
        this.item = item;
        this.quantityLot = quantityLot;
        this.price = price;
        this.observedAt = observedAt;
        this.source = source;
    }

    public static PriceObservation forResource(GameServer server, Resource resource,
            int quantityLot, long price, Instant observedAt, String source) {
        return new PriceObservation(server, resource, null, quantityLot, price, observedAt, source);
    }

    public static PriceObservation forItem(GameServer server, Item item,
            int quantityLot, long price, Instant observedAt, String source) {
        return new PriceObservation(server, null, item, quantityLot, price, observedAt, source);
    }

    public Long getId() {
        return id;
    }

    public GameServer getServer() {
        return server;
    }

    public Resource getResource() {
        return resource;
    }

    public Item getItem() {
        return item;
    }

    public int getQuantityLot() {
        return quantityLot;
    }

    public long getPrice() {
        return price;
    }

    public Instant getObservedAt() {
        return observedAt;
    }

    public String getSource() {
        return source;
    }
}
