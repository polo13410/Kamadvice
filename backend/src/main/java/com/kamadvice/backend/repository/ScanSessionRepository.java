package com.kamadvice.backend.repository;

import com.kamadvice.backend.domain.ScanSession;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ScanSessionRepository extends JpaRepository<ScanSession, Long> {
}
