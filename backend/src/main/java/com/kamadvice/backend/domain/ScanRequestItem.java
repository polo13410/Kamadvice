package com.kamadvice.backend.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * A single target ("scan this resource/item") requested within a
 * {@link ScanSession}. Exactly one of {@code resource} or
 * {@code item} must be set, enforced by a DB check constraint (see
 * the Flyway migration).
 */
@Entity
@Table(name = "scan_request_item")
public class ScanRequestItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "scan_session_id")
    private ScanSession scanSession;

    @ManyToOne
    @JoinColumn(name = "resource_id")
    private Resource resource;

    @ManyToOne
    @JoinColumn(name = "item_id")
    private Item item;

    @Enumerated(EnumType.STRING)
    private ScanStatus status = ScanStatus.PENDING;

    protected ScanRequestItem() {
        // JPA
    }

    private ScanRequestItem(ScanSession scanSession, Resource resource, Item item) {
        this.scanSession = scanSession;
        this.resource = resource;
        this.item = item;
    }

    public static ScanRequestItem ofResource(ScanSession scanSession, Resource resource) {
        return new ScanRequestItem(scanSession, resource, null);
    }

    public static ScanRequestItem ofItem(ScanSession scanSession, Item item) {
        return new ScanRequestItem(scanSession, null, item);
    }

    public Long getId() {
        return id;
    }

    public ScanSession getScanSession() {
        return scanSession;
    }

    public Resource getResource() {
        return resource;
    }

    public Item getItem() {
        return item;
    }

    public ScanStatus getStatus() {
        return status;
    }

    public void setStatus(ScanStatus status) {
        this.status = status;
    }
}
