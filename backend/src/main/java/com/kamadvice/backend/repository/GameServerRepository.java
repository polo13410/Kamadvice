package com.kamadvice.backend.repository;

import com.kamadvice.backend.domain.GameServer;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GameServerRepository extends JpaRepository<GameServer, Long> {
}
