package com.kamadvice.backend.repository;

import com.kamadvice.backend.domain.Profession;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProfessionRepository extends JpaRepository<Profession, Long> {
}
