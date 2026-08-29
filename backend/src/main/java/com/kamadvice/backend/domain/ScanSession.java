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
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;

/**
 * A batch of price collection work: "scan these resources/items on
 * this server". Created by the backend when it needs fresh prices,
 * consumed by the scanner, which reports back
 * {@link PriceObservation}s.
 */
@Entity
@Table(name = "scan_session")
public class ScanSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "server_id")
    private GameServer server;

    @Enumerated(EnumType.STRING)
    private ScanStatus status = ScanStatus.PENDING;

    @CreationTimestamp
    private Instant createdAt;

    private Instant completedAt;

    protected ScanSession() {
        // JPA
    }

    public ScanSession(GameServer server) {
        this.server = server;
    }

    public Long getId() {
        return id;
    }

    public GameServer getServer() {
        return server;
    }

    public ScanStatus getStatus() {
        return status;
    }

    public void setStatus(ScanStatus status) {
        this.status = status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public void setCompletedAt(Instant completedAt) {
        this.completedAt = completedAt;
    }
}
