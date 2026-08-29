package com.kamadvice.backend.repository;

import com.kamadvice.backend.domain.Resource;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ResourceRepository extends JpaRepository<Resource, Long> {
}
